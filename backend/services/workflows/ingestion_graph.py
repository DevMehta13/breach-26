from __future__ import annotations

import logging
import uuid
from typing import TypedDict

from langgraph.graph import StateGraph, END

logger = logging.getLogger(__name__)

from backend.services.parsing.extractor import extract_text, ExtractionError
from backend.services.parsing.gemini_parser import parse_resume, parse_linkedin_resume
from backend.services.parsing.embedding import generate_embedding
from backend.services.dedup.engine import run_dedup_check, DedupClassification
from backend.services.dedup.merger import merge_candidates
from backend.models.candidate import Candidate
from backend.models.dedup import DedupQueue
from backend.core.database import AsyncSessionLocal
from backend.core.websocket_manager import manager as ws_manager


class IngestionState(TypedDict, total=False):
    # Input
    file_bytes: bytes
    filename: str
    source: str
    user_id: str
    # Pipeline outputs
    raw_text: str
    parsed_data: dict
    embedding: list[float]
    # Dedup results
    dedup_classification: str       # "auto_merge" | "manual_review" | "new_candidate"
    dedup_match_id: str | None      # UUID of best matching candidate
    dedup_score: float
    dedup_breakdown: dict | None
    # Final
    candidate_id: str
    status: str
    error: str | None


# ── Node functions ────────────────────────────────────────────────


def extract_text_node(state: IngestionState) -> dict:
    """Extract raw text from the uploaded file.

    Skips extraction if raw_text is already provided (e.g., HRMS pre-structured data).
    """
    if state.get("raw_text"):
        logger.info("extract_text_node: raw_text already present, skipping extraction")
        return {"status": "text_extracted"}
    try:
        raw_text = extract_text(state["file_bytes"], state["filename"])
        logger.info("extract_text_node: extracted %d chars from %s", len(raw_text), state.get("filename"))
        return {"raw_text": raw_text, "status": "text_extracted"}
    except ExtractionError as e:
        logger.error("extract_text_node FAILED: %s", e)
        return {"status": "needs_review", "error": str(e)}


def parse_with_gemini_node(state: IngestionState) -> dict:
    """Call Gemini to extract structured resume data.

    Uses a LinkedIn-specific prompt when source is 'linkedin',
    otherwise falls back to the generic resume parser.
    """
    if state.get("status") == "needs_review":
        logger.warning("parse_with_gemini_node: skipping — already needs_review")
        return {}
    try:
        raw_text = state.get("raw_text", "")
        logger.info("parse_with_gemini_node: parsing %d chars, source=%s", len(raw_text), state.get("source"))
        if state.get("source") == "linkedin":
            parsed = parse_linkedin_resume(raw_text)
        else:
            parsed = parse_resume(raw_text)
        logger.info("parse_with_gemini_node: SUCCESS — name=%s, skills=%s", parsed.full_name, parsed.skills)
        return {"parsed_data": parsed.model_dump(), "status": "parsed"}
    except Exception as e:
        logger.error("parse_with_gemini_node FAILED: %s", e, exc_info=True)
        return {"status": "needs_review", "error": f"Gemini parsing failed: {e}"}


def generate_embedding_node(state: IngestionState) -> dict:
    """Generate a 768-dim embedding from the resume text."""
    if state.get("status") == "needs_review":
        return {}
    try:
        text_for_embedding = _build_embedding_text(state)
        embedding = generate_embedding(text_for_embedding)
        return {"embedding": embedding, "status": "embedded"}
    except Exception as e:
        return {"status": "needs_review", "error": f"Embedding generation failed: {e}"}


async def run_dedup_check_node(state: IngestionState) -> dict:
    """Run the dedup engine against existing candidates."""
    if state.get("status") == "needs_review":
        return {"dedup_classification": DedupClassification.NEW_CANDIDATE.value}

    parsed_data = state.get("parsed_data", {})
    embedding = state.get("embedding")

    async with AsyncSessionLocal() as session:
        result = await run_dedup_check(
            session=session,
            parsed_data=parsed_data,
            embedding=embedding,
        )

    return {
        "dedup_classification": result.classification.value,
        "dedup_match_id": result.best_match_id,
        "dedup_score": result.best_score,
        "dedup_breakdown": result.score_breakdown,
        "status": "dedup_complete",
    }


async def save_to_db_node(state: IngestionState) -> dict:
    """Persist the candidate — behavior depends on dedup classification.

    NEW_CANDIDATE:  Insert as a new row.
    AUTO_MERGE:     Merge into the existing record, log to CandidateMergeHistory.
    MANUAL_REVIEW:  Insert as new row, create a DedupQueue entry linking both.
    """
    parsed = state.get("parsed_data", {})
    classification = state.get("dedup_classification", DedupClassification.NEW_CANDIDATE.value)
    match_id = state.get("dedup_match_id")
    is_failed = state.get("status") == "needs_review"

    async with AsyncSessionLocal() as session:
        # ── AUTO MERGE ────────────────────────────────────────
        if classification == DedupClassification.AUTO_MERGE.value and match_id and not is_failed:
            from sqlalchemy import select
            result = await session.execute(
                select(Candidate).where(Candidate.id == uuid.UUID(match_id))
            )
            primary = result.scalar_one_or_none()

            if primary:
                score_reason = _build_score_reason(state)
                merge_result = await merge_candidates(
                    session=session,
                    primary=primary,
                    new_data=parsed,
                    new_embedding=state.get("embedding"),
                    merge_type="auto",
                    score_reason=score_reason,
                )
                await session.commit()
                await ws_manager.broadcast({
                    "type": "INGESTION_COMPLETE",
                    "candidate_id": merge_result["candidate_id"],
                    "candidate_name": parsed.get("full_name", "Unknown"),
                    "status": "auto_merged",
                    "source": state.get("source", "resume_upload"),
                })
                return {
                    "candidate_id": merge_result["candidate_id"],
                    "status": "auto_merged",
                }

        # ── NEW CANDIDATE or MANUAL REVIEW — insert new row ──
        candidate = Candidate(
            full_name=parsed.get("full_name", "Unknown"),
            email=parsed.get("email"),
            phone=parsed.get("phone"),
            linkedin_url=parsed.get("linkedin_url"),
            location=parsed.get("location"),
            current_title=parsed.get("current_title"),
            years_experience=parsed.get("years_experience"),
            skills=parsed.get("skills"),
            education=[e for e in parsed.get("education", [])],
            experience=[e for e in parsed.get("experience", [])],
            summary=parsed.get("summary"),
            raw_text=state.get("raw_text"),
            embedding=state.get("embedding"),
            source=state.get("source", "resume_upload"),
            source_ref=state.get("filename"),
            ingestion_status="needs_review" if is_failed else "completed",
            ingestion_error=state.get("error"),
            confidence_score=parsed.get("confidence_score"),
            created_by=uuid.UUID(state["user_id"]) if state.get("user_id") else None,
        )
        session.add(candidate)
        await session.flush()  # get the ID before creating dedup queue entry

        # ── MANUAL REVIEW — also create DedupQueue entry ─────
        if classification == DedupClassification.MANUAL_REVIEW.value and match_id and not is_failed:
            queue_entry = DedupQueue(
                candidate_a_id=uuid.UUID(match_id),
                candidate_b_id=candidate.id,
                composite_score=state.get("dedup_score", 0.0),
                score_breakdown=state.get("dedup_breakdown"),
                status="pending",
            )
            session.add(queue_entry)

        await session.commit()
        await session.refresh(candidate)

        status = "completed"
        if is_failed:
            status = "needs_review"
        elif classification == DedupClassification.MANUAL_REVIEW.value and match_id:
            status = "pending_review"

        await ws_manager.broadcast({
            "type": "INGESTION_COMPLETE",
            "candidate_id": str(candidate.id),
            "candidate_name": parsed.get("full_name", "Unknown"),
            "status": status,
            "source": state.get("source", "resume_upload"),
        })

        return {"candidate_id": str(candidate.id), "status": status}


# ── Routing ───────────────────────────────────────────────────────


def _route_or_save(state: IngestionState, next_node: str) -> str:
    if state.get("status") == "needs_review":
        return "save_to_db"
    return next_node


def route_after_extract(state: IngestionState) -> str:
    return _route_or_save(state, "parse_with_gemini")


def route_after_parse(state: IngestionState) -> str:
    return _route_or_save(state, "generate_embedding")


def route_after_embedding(state: IngestionState) -> str:
    return _route_or_save(state, "run_dedup_check")


def route_after_dedup(state: IngestionState) -> str:
    return "save_to_db"


# ── Graph assembly ────────────────────────────────────────────────


def build_ingestion_graph() -> StateGraph:
    graph = StateGraph(IngestionState)

    graph.add_node("extract_text", extract_text_node)
    graph.add_node("parse_with_gemini", parse_with_gemini_node)
    graph.add_node("generate_embedding", generate_embedding_node)
    graph.add_node("run_dedup_check", run_dedup_check_node)
    graph.add_node("save_to_db", save_to_db_node)

    graph.set_entry_point("extract_text")
    graph.add_conditional_edges(
        "extract_text",
        route_after_extract,
        {"parse_with_gemini": "parse_with_gemini", "save_to_db": "save_to_db"},
    )
    graph.add_conditional_edges(
        "parse_with_gemini",
        route_after_parse,
        {"generate_embedding": "generate_embedding", "save_to_db": "save_to_db"},
    )
    graph.add_conditional_edges(
        "generate_embedding",
        route_after_embedding,
        {"run_dedup_check": "run_dedup_check", "save_to_db": "save_to_db"},
    )
    graph.add_edge("run_dedup_check", "save_to_db")
    graph.add_edge("save_to_db", END)

    return graph.compile()


# ── Helpers ───────────────────────────────────────────────────────


def _build_embedding_text(state: IngestionState) -> str:
    parsed = state.get("parsed_data", {})
    parts = []
    if parsed.get("full_name"):
        parts.append(parsed["full_name"])
    if parsed.get("current_title"):
        parts.append(parsed["current_title"])
    if parsed.get("summary"):
        parts.append(parsed["summary"])
    if parsed.get("skills"):
        parts.append("Skills: " + ", ".join(parsed["skills"]))
    raw = state.get("raw_text", "")
    if raw:
        parts.append(raw[:2000])
    return "\n".join(parts)


def _build_score_reason(state: IngestionState) -> str:
    """Build a human-readable merge reason from score breakdown."""
    breakdown = state.get("dedup_breakdown", {})
    score = state.get("dedup_score", 0.0)
    parts = []
    for signal, val in (breakdown or {}).items():
        if val > 0:
            parts.append(f"{signal}({val})")
    return f"composite={score:.2f}: " + " + ".join(parts) if parts else f"composite={score:.2f}"


# Singleton compiled graph
ingestion_graph = build_ingestion_graph()
