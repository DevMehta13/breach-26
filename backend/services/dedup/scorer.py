"""Stage 2: Multi-Layer Cascading Dedup Scorer.

Layer 1 (Deterministic): Exact email or phone match → instant 0.95 score.
Layer 2 (Adaptive Weighted): Redistribute weights based on which fields are
    actually present on BOTH candidates. If email is null on either side,
    its weight is redistributed to other signals — no weight is wasted.
Layer 3 (Semantic + Fuzzy): High embedding similarity + name similarity
    can independently trigger dedup even when email/phone are both null.

This solves the "LinkedIn PDF has no email" problem: when a LinkedIn profile
(no email) is compared against a Gmail resume (has email), Layer 2 ignores
the email signal and redistributes that weight to name/embedding/LinkedIn,
allowing strong name + embedding match to reach the merge threshold.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

import numpy as np
from thefuzz import fuzz

from backend.models.candidate import Candidate

logger = logging.getLogger(__name__)


# ── Base weights (used when all fields are present on both sides) ────

BASE_WEIGHTS = {
    "email": 0.30,
    "phone": 0.15,
    "name": 0.25,
    "linkedin": 0.10,
    "embedding": 0.20,
}

# Layer 3 thresholds: semantic + fuzzy bypass
EMBEDDING_BYPASS_THRESHOLD = 0.82
NAME_BYPASS_THRESHOLD = 0.75


# ── Individual signal scorers ─────────────────────────────────────


def score_email(new_email: str | None, existing_email: str | None) -> tuple[float, bool]:
    """Score email similarity. Returns (score, both_present)."""
    if not new_email or not existing_email:
        return 0.0, False
    a, b = new_email.lower().strip(), existing_email.lower().strip()
    if a == b:
        return 1.0, True
    a_domain = a.split("@")[-1] if "@" in a else ""
    b_domain = b.split("@")[-1] if "@" in b else ""
    if a_domain and a_domain == b_domain:
        return 0.2, True
    return 0.0, True


def score_phone(new_phone: str | None, existing_phone: str | None) -> tuple[float, bool]:
    """Score phone similarity. Returns (score, both_present)."""
    if not new_phone or not existing_phone:
        return 0.0, False
    a = re.sub(r"\D", "", new_phone)
    b = re.sub(r"\D", "", existing_phone)
    if len(a) > 10:
        a = a[-10:]
    if len(b) > 10:
        b = b[-10:]
    if a == b:
        return 1.0, True
    if len(a) >= 7 and len(b) >= 7 and a[-7:] == b[-7:]:
        return 0.5, True
    return 0.0, True


def score_name(new_name: str | None, existing_name: str | None) -> tuple[float, bool]:
    """Score name similarity using token_sort_ratio + partial_ratio.

    Handles: 'Jordan Davis' vs 'Davis, Jordan', 'Jon' vs 'Jonathan', etc.
    Returns (score, both_present).
    """
    if not new_name or not existing_name:
        return 0.0, False
    a = new_name.lower().strip()
    b = existing_name.lower().strip()
    if a == b:
        return 1.0, True
    token_sort = fuzz.token_sort_ratio(a, b) / 100.0
    partial = fuzz.partial_ratio(a, b) / 100.0
    score = 0.7 * token_sort + 0.3 * partial
    return round(score, 4), True


def score_linkedin(new_url: str | None, existing_url: str | None) -> tuple[float, bool]:
    """Score LinkedIn URL match. Returns (score, both_present)."""
    if not new_url or not existing_url:
        return 0.0, False
    a = _normalize_linkedin(new_url)
    b = _normalize_linkedin(existing_url)
    if a and b and a == b:
        return 1.0, True
    return 0.0, True


def score_embedding(
    new_embedding: list[float] | None,
    existing_embedding: list | None,
) -> tuple[float, bool]:
    """Score embedding cosine similarity. Returns (score, both_present)."""
    if new_embedding is None or existing_embedding is None:
        return 0.0, False
    a = np.array(new_embedding, dtype=np.float32)
    b = np.array(existing_embedding, dtype=np.float32)
    dot = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0, True
    cosine_sim = float(dot / (norm_a * norm_b))
    return round(max(0.0, min(1.0, cosine_sim)), 4), True


# ── Composite scorer ─────────────────────────────────────────────


@dataclass
class ScoreResult:
    composite_score: float
    breakdown: dict[str, float]
    matched_candidate_id: str
    match_reason: str


def compute_composite_score(
    parsed_data: dict,
    embedding: list[float] | None,
    existing: Candidate,
) -> ScoreResult:
    """Multi-layer cascading dedup score.

    Layer 1: Deterministic — exact email or phone → 0.95
    Layer 2: Adaptive weighted — redistributes null-field weights
    Layer 3: Semantic bypass — high embedding + name similarity → 0.90
    """
    new_name = parsed_data.get("full_name")
    existing_name = existing.full_name
    existing_emb = list(existing.embedding) if existing.embedding is not None else None

    # Compute all individual scores
    email_s, email_present = score_email(parsed_data.get("email"), existing.email)
    phone_s, phone_present = score_phone(parsed_data.get("phone"), existing.phone)
    name_s, name_present = score_name(new_name, existing_name)
    linkedin_s, linkedin_present = score_linkedin(parsed_data.get("linkedin_url"), existing.linkedin_url)
    embedding_s, embedding_present = score_embedding(embedding, existing_emb)

    breakdown = {
        "email": round(email_s, 3),
        "phone": round(phone_s, 3),
        "name_fuzzy": round(name_s, 3),
        "linkedin": round(linkedin_s, 3),
        "embedding_cosine": round(embedding_s, 3),
    }

    # ── Layer 1: Deterministic match ─────────────────────────────
    if email_s >= 1.0:
        logger.info(
            "DEDUP Layer 1 HIT: exact email match '%s' == '%s' → 1.0 | vs %s (id=%s)",
            parsed_data.get("email"), existing.email, existing_name, existing.id,
        )
        return ScoreResult(
            composite_score=1.0,
            breakdown=breakdown,
            matched_candidate_id=str(existing.id),
            match_reason="Layer 1: exact email match",
        )

    if phone_s >= 1.0:
        logger.info(
            "DEDUP Layer 1 HIT: exact phone match '%s' == '%s' → 1.0 | vs %s (id=%s)",
            parsed_data.get("phone"), existing.phone, existing_name, existing.id,
        )
        return ScoreResult(
            composite_score=1.0,
            breakdown=breakdown,
            matched_candidate_id=str(existing.id),
            match_reason="Layer 1: exact phone match",
        )

    # ── Layer 3: Semantic + Fuzzy bypass ─────────────────────────
    # High embedding similarity AND high name similarity → likely same person
    # even without email/phone. This catches the LinkedIn-vs-Resume case.
    if (
        embedding_s >= EMBEDDING_BYPASS_THRESHOLD
        and name_s >= NAME_BYPASS_THRESHOLD
    ):
        bypass_score = 0.70 * embedding_s + 0.30 * name_s
        # Clamp to 0.90 — strong signal but leave room for Layer 1 certainty
        final_score = round(min(bypass_score, 0.90), 4)
        logger.info(
            "DEDUP Layer 3 HIT: embedding=%.3f (>%.2f) + name=%.3f (>%.2f) → %.4f | "
            "'%s' vs '%s' (id=%s)",
            embedding_s, EMBEDDING_BYPASS_THRESHOLD,
            name_s, NAME_BYPASS_THRESHOLD,
            final_score, new_name, existing_name, existing.id,
        )
        return ScoreResult(
            composite_score=final_score,
            breakdown=breakdown,
            matched_candidate_id=str(existing.id),
            match_reason=f"Layer 3: semantic bypass (emb={embedding_s:.3f}, name={name_s:.3f})",
        )

    # ── Layer 2: Adaptive weighted scoring ───────────────────────
    # Only include signals where BOTH sides have data.
    # Redistribute weights of null-field signals proportionally.
    active_signals: dict[str, tuple[float, float]] = {}  # signal -> (score, base_weight)

    if email_present:
        active_signals["email"] = (email_s, BASE_WEIGHTS["email"])
    if phone_present:
        active_signals["phone"] = (phone_s, BASE_WEIGHTS["phone"])
    if name_present:
        active_signals["name"] = (name_s, BASE_WEIGHTS["name"])
    if linkedin_present:
        active_signals["linkedin"] = (linkedin_s, BASE_WEIGHTS["linkedin"])
    if embedding_present:
        active_signals["embedding"] = (embedding_s, BASE_WEIGHTS["embedding"])

    if not active_signals:
        logger.info(
            "DEDUP Layer 2: no active signals for '%s' vs '%s' (id=%s) → 0.0",
            new_name, existing_name, existing.id,
        )
        return ScoreResult(
            composite_score=0.0,
            breakdown=breakdown,
            matched_candidate_id=str(existing.id),
            match_reason="Layer 2: no signals available",
        )

    # Redistribute: normalize active weights to sum to 1.0
    total_active_weight = sum(w for _, w in active_signals.values())
    composite = 0.0
    for signal_name, (score, base_weight) in active_signals.items():
        adjusted_weight = base_weight / total_active_weight
        composite += adjusted_weight * score

    composite = round(composite, 4)

    active_names = list(active_signals.keys())
    num_active = len(active_signals)

    # ── Guard: single-signal cap ──────────────────────────────────
    # One signal alone is too weak to confirm identity. Cap at 0.40
    # so it never reaches the MANUAL_REVIEW threshold (0.60).
    # Only Layer 1 deterministic matches (exact email/phone) can stand alone.
    if num_active == 1:
        capped = min(composite, 0.40)
        logger.info(
            "DEDUP Layer 2: SINGLE-SIGNAL CAP '%s' vs '%s' (id=%s) → "
            "raw=%.4f capped=%.4f | signal=%s | breakdown=%s",
            new_name, existing_name, existing.id,
            composite, capped, active_names, breakdown,
        )
        return ScoreResult(
            composite_score=capped,
            breakdown=breakdown,
            matched_candidate_id=str(existing.id),
            match_reason=f"Layer 2: single-signal capped ({active_names[0]})",
        )

    logger.info(
        "DEDUP Layer 2: '%s' vs '%s' (id=%s) → composite=%.4f | "
        "active_signals=%d %s | breakdown=%s",
        new_name, existing_name, existing.id,
        composite, num_active, active_names, breakdown,
    )

    return ScoreResult(
        composite_score=composite,
        breakdown=breakdown,
        matched_candidate_id=str(existing.id),
        match_reason=f"Layer 2: adaptive weighted ({', '.join(active_names)})",
    )


# ── Helpers ───────────────────────────────────────────────────────


def _normalize_linkedin(url: str) -> str | None:
    """Normalize a LinkedIn URL to just the profile slug."""
    if not url:
        return None
    url = url.lower().strip().rstrip("/")
    match = re.search(r"linkedin\.com/in/([^/?#]+)", url)
    if match:
        return match.group(1)
    return url
