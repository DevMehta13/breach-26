"""Merge logic for candidate deduplication.

When two candidates are determined to be the same person, this module
merges new data into the existing (primary) record.

Field resolution strategy:
    1. Only one has the field          -> keep it
    2. Both have same value            -> keep it
    3. Values conflict                 -> keep the one from newer source
    4. Arrays (skills, education, exp) -> union + dedup
    5. All decisions recorded in field_resolutions JSONB
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.candidate import Candidate, CandidateMergeHistory


# Scalar fields that should be resolved by "keep most recent"
_SCALAR_FIELDS = [
    "full_name", "email", "phone", "linkedin_url", "location",
    "current_title", "years_experience", "summary",
]


async def merge_candidates(
    session: AsyncSession,
    primary: Candidate,
    new_data: dict,
    new_embedding: list[float] | None,
    merge_type: str = "auto",
    merged_by: uuid.UUID | None = None,
    score_reason: str = "",
) -> dict:
    """Merge new_data into the primary candidate record.

    Args:
        session: DB session (caller manages commit)
        primary: The existing Candidate ORM object to update
        new_data: Parsed data dict from the new resume
        new_embedding: New embedding vector (may replace old)
        merge_type: 'auto' or 'manual'
        merged_by: User UUID if manual merge
        score_reason: Human-readable reason (e.g., "email_match + fuzzy_name(0.92)")

    Returns:
        dict with candidate_id and field_resolutions
    """
    resolutions = {}

    # ── Scalar fields ─────────────────────────────────────────────
    for field in _SCALAR_FIELDS:
        old_val = getattr(primary, field, None)
        new_val = new_data.get(field)
        resolution = _resolve_scalar(field, old_val, new_val)
        if resolution["action"] != "no_change":
            resolutions[field] = resolution
            if resolution["action"] == "updated":
                setattr(primary, field, resolution["kept"])

    # ── Array fields (union + dedup) ──────────────────────────────
    for field in ("skills", "education", "experience"):
        old_val = getattr(primary, field, None) or []
        new_val = new_data.get(field, [])
        merged, resolution = _merge_array(field, old_val, new_val)
        if resolution["action"] != "no_change":
            resolutions[field] = resolution
            setattr(primary, field, merged)

    # ── Embedding — keep the newer one if available ───────────────
    if new_embedding is not None:
        resolutions["embedding"] = {"action": "updated", "reason": "newer_embedding"}
        primary.embedding = new_embedding

    # ── Raw text — append if different ────────────────────────────
    new_raw = new_data.get("raw_text") or ""
    if new_raw and primary.raw_text and new_raw not in primary.raw_text:
        resolutions["raw_text"] = {"action": "appended", "reason": "additional_source"}
        primary.raw_text = primary.raw_text + "\n\n--- MERGED SOURCE ---\n\n" + new_raw
    elif new_raw and not primary.raw_text:
        primary.raw_text = new_raw
        resolutions["raw_text"] = {"action": "set", "reason": "was_empty"}

    # ── Confidence score — keep the higher one ────────────────────
    new_conf = new_data.get("confidence_score")
    if new_conf and (primary.confidence_score is None or new_conf > primary.confidence_score):
        primary.confidence_score = new_conf

    # ── Update metadata ───────────────────────────────────────────
    primary.updated_at = datetime.now(timezone.utc)
    primary.ingestion_status = "completed"

    # ── Record merge history ──────────────────────────────────────
    history = CandidateMergeHistory(
        primary_candidate_id=primary.id,
        merged_candidate_id=primary.id,  # placeholder — overwritten by caller if needed
        merge_type=merge_type,
        merge_reason=score_reason,
        field_resolutions=resolutions,
        merged_by=merged_by,
    )
    session.add(history)

    return {
        "candidate_id": str(primary.id),
        "field_resolutions": resolutions,
        "merge_history_recorded": True,
    }


# ── Resolution helpers ────────────────────────────────────────────


def _resolve_scalar(field: str, old_val, new_val) -> dict:
    """Decide which scalar value to keep."""
    if old_val is None and new_val is None:
        return {"action": "no_change"}
    if old_val is None and new_val is not None:
        return {"action": "updated", "kept": new_val, "reason": "was_empty"}
    if new_val is None:
        return {"action": "no_change"}
    if str(old_val).strip().lower() == str(new_val).strip().lower():
        return {"action": "no_change"}
    # Conflict: keep new (most recent)
    return {
        "action": "updated",
        "kept": new_val,
        "discarded": old_val,
        "reason": "most_recent",
    }


def _merge_array(field: str, old_list: list, new_list: list) -> tuple[list, dict]:
    """Union two lists, deduplicating by content."""
    if not new_list:
        return old_list, {"action": "no_change"}
    if not old_list:
        return new_list, {"action": "set", "reason": "was_empty", "added": len(new_list)}

    if field == "skills":
        # Skills are simple strings — union by lowercase
        seen = {s.lower() for s in old_list}
        added = [s for s in new_list if s.lower() not in seen]
        if not added:
            return old_list, {"action": "no_change"}
        merged = old_list + added
        return merged, {"action": "union", "added": len(added), "total": len(merged)}

    # Education/experience are dicts — dedup by serialized comparison
    old_set = {_dict_fingerprint(d) for d in old_list}
    added = [d for d in new_list if _dict_fingerprint(d) not in old_set]
    if not added:
        return old_list, {"action": "no_change"}
    merged = old_list + added
    return merged, {"action": "union", "added": len(added), "total": len(merged)}


def _dict_fingerprint(d: dict) -> str:
    """Create a rough fingerprint of a dict for dedup comparison."""
    parts = []
    for k in sorted(d.keys()):
        v = str(d[k]).lower().strip() if d[k] else ""
        parts.append(f"{k}={v}")
    return "|".join(parts)
