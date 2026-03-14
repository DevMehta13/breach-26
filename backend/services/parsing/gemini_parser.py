import logging
import time

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from backend.core.config import get_settings
from backend.schemas.ingest import ParsedResume

logger = logging.getLogger(__name__)

_gemini_llm = None
_groq_llm = None


def _get_gemini_llm() -> ChatGoogleGenerativeAI:
    global _gemini_llm
    if _gemini_llm is None:
        settings = get_settings()
        _gemini_llm = ChatGoogleGenerativeAI(
            model=settings.GEMINI_MODEL,
            google_api_key=settings.GEMINI_API_KEY,
            temperature=0,
            max_retries=1,
            timeout=30,
        )
    return _gemini_llm


def _get_groq_llm() -> ChatGroq:
    global _groq_llm
    if _groq_llm is None:
        settings = get_settings()
        _groq_llm = ChatGroq(
            model="llama-3.3-70b-versatile",
            api_key=settings.GROQ_API_KEY,
            temperature=0,
            max_retries=2,
            timeout=30,
        )
    return _groq_llm


_RESUME_PROMPT = (
    "You are an expert resume parser. Extract structured data from the "
    "following resume text. Rules:\n"
    "- Return null for any field you cannot confidently extract.\n"
    "- Do NOT hallucinate information that is not in the text.\n"
    "- Normalize skill names: 'JS' -> 'JavaScript', 'React.js' -> 'React', "
    "'TS' -> 'TypeScript', 'Postgres' -> 'PostgreSQL', etc.\n"
    "- CRITICAL for years_experience: Calculate TOTAL years by summing "
    "durations across ALL positions in work history. "
    "'2018-2021' = 3 years, '2021-Present' = count from 2021 to now. "
    "Round to nearest integer. NEVER default to 0 — if the candidate "
    "has ANY work experience listed, the value MUST be >= 1. "
    "If dates are ambiguous, estimate conservatively but not zero.\n"
    "- confidence_score: rate 0.0-1.0 how confident you are in the "
    "overall extraction quality.\n\n"
)


_LINKEDIN_SYSTEM_PROMPT = (
    "You are an expert parser for LinkedIn 'Save to PDF' profile exports. "
    "These PDFs have a very specific format that you MUST handle correctly.\n\n"

    "LINKEDIN PDF STRUCTURE (in order):\n"
    "1. Full name (large text at top)\n"
    "2. Headline — this is the current_title. It appears right below the name. "
    "Examples: 'Senior Software Engineer at Google', 'ML Engineer | AI Researcher'. "
    "Extract just the job title part (before 'at' if present).\n"
    "3. Location line (e.g., 'San Francisco, California, United States'). "
    "Normalize to 'City, State' format: 'San Francisco, CA'.\n"
    "4. Contact info section — may contain email, phone, LinkedIn URL, website.\n"
    "5. 'About' or 'Summary' section — use this as the summary.\n"
    "6. 'Experience' section — THIS IS THE HARDEST PART:\n"
    "   - LinkedIn groups MULTIPLE ROLES under a single COMPANY.\n"
    "   - Format: Company name on one line, then indented roles below it.\n"
    "   - Each role has: Title, date range (e.g., 'Jan 2020 - Present · 4 yrs 2 mos'), location.\n"
    "   - You MUST create a SEPARATE ExperienceEntry for EACH role, not one per company.\n"
    "   - For duration: use the date range text (e.g., 'Jan 2020 - Dec 2022'), not the '· X yrs' part.\n"
    "   - The '· 4 yrs 2 mos' duration annotations are per-role durations — use them to VERIFY "
    "your total years calculation, but do NOT double-count overlapping company durations.\n"
    "7. 'Education' section — degree, institution, dates, field of study.\n"
    "8. 'Licenses & Certifications' — include certification names in the skills array "
    "(e.g., 'AWS Solutions Architect', 'PMP', 'CKA').\n"
    "9. 'Skills' section — LinkedIn lists skills sometimes with endorsement counts "
    "(e.g., 'Python · 42'). IGNORE the endorsement number, just extract the skill name.\n"
    "10. Other sections ('Volunteer Experience', 'Projects', 'Publications', 'Honors') — "
    "ignore these unless they contain skills.\n\n"

    "CRITICAL RULES:\n"
    "- years_experience: Calculate TOTAL years by looking at the earliest start date and "
    "the latest end date (or 'Present'). Do NOT sum per-role durations — that double-counts "
    "overlapping roles at the same company. If first role started Jan 2018 and latest is "
    "Present (2025), total = ~7 years.\n"
    "- skills: Merge skills from the 'Skills' section AND 'Licenses & Certifications' into "
    "one flat list. Normalize names: 'JS' -> 'JavaScript', 'React.js' -> 'React'.\n"
    "- Do NOT hallucinate. If a field is missing from the PDF, return null.\n"
    "- confidence_score: rate 0.0-1.0 based on how complete the LinkedIn profile is.\n"
)


def _parse_with_fallback(prompt: str) -> ParsedResume:
    """Try Gemini first, fall back to Groq on any error (rate limit, timeout, etc)."""
    # ── Attempt 1: Gemini ────────────────────────────────────────
    try:
        llm = _get_gemini_llm()
        structured = llm.with_structured_output(ParsedResume)
        result = structured.invoke(prompt)
        logger.info("Parsed with Gemini OK: %s", result.full_name)
        return result
    except Exception as e:
        logger.warning("Gemini failed (%s), falling back to Groq", e)

    # ── Attempt 2: Groq (free, fast) ────────────────────────────
    llm = _get_groq_llm()
    structured = llm.with_structured_output(ParsedResume)
    result = structured.invoke(prompt)
    logger.info("Parsed with Groq OK: %s", result.full_name)
    return result


def parse_resume(raw_text: str) -> ParsedResume:
    """Parse a standard resume with Gemini → Groq fallback."""
    prompt = f"{_RESUME_PROMPT}RESUME TEXT:\n{raw_text}"
    return _parse_with_fallback(prompt)


def parse_linkedin_resume(raw_text: str) -> ParsedResume:
    """Parse a LinkedIn PDF with Gemini → Groq fallback."""
    prompt = f"{_LINKEDIN_SYSTEM_PROMPT}\nLINKEDIN PROFILE TEXT:\n{raw_text}"
    return _parse_with_fallback(prompt)
