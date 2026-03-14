"""Groq-powered query analyzer for natural language search.

Uses ChatGroq (llama3-8b-8192) with structured output to parse
a raw search query into semantic + filter components.
"""

from __future__ import annotations

import re

from pydantic import BaseModel, Field
from langchain_groq import ChatGroq
from backend.core.config import get_settings


class SearchIntent(BaseModel):
    """Structured representation of a natural language search query."""

    semantic_query: str = Field(
        description="The core semantic meaning of the search query, "
        "rephrased for embedding similarity search against candidate profiles."
    )
    skills: list[str] = Field(
        default_factory=list,
        description="Specific technical or professional skills mentioned in the query. "
        "Include programming languages, frameworks, cloud platforms, tools. "
        "Examples: 'AWS', 'Python', 'React', 'Kubernetes', 'Docker'.",
    )
    location: str = Field(
        default="",
        description="Geographic location filter extracted from the query. "
        "Empty string if no location specified.",
    )
    min_experience_years: int = Field(
        default=0,
        description="Minimum years of experience as an INTEGER. "
        "Extract from phrases like '10+ years' -> 10, '5 years experience' -> 5, "
        "'senior' -> 5, 'staff' -> 8, 'principal' -> 12. "
        "MUST be 0 if not specified or inferable.",
    )
    max_experience_years: int = Field(
        default=0,
        description="Maximum years of experience as an INTEGER. "
        "Extract from phrases like 'less than 10 years' -> 10, "
        "'under 5 years' -> 5, 'at most 8 years' -> 8, "
        "'fewer than 3 years' -> 3, 'below 10 years' -> 10. "
        "MUST be 0 if not specified.",
    )
    is_strict_skill_match: bool = Field(
        default=False,
        description="True if the user explicitly demands a specific technology. "
        "Phrases like 'AWS developer', 'must know Python', 'React expert', "
        "'with Java experience' all indicate strict matching. "
        "False only for vague queries like 'good engineer' or 'senior developer'.",
    )


_analyzer = None


def _get_analyzer():
    global _analyzer
    if _analyzer is None:
        settings = get_settings()
        llm = ChatGroq(
            model="llama3-8b-8192",
            api_key=settings.GROQ_API_KEY,
            temperature=0,
            max_retries=2,
        )
        _analyzer = llm.with_structured_output(SearchIntent)
    return _analyzer


SYSTEM_PROMPT = (
    "You are a recruitment search query parser. Given a natural language query "
    "about finding candidates, extract the structured search intent.\n\n"
    "STRICT RULES:\n"
    "- semantic_query: rephrase the query to capture the core meaning for "
    "embedding similarity search against candidate resumes/profiles\n"
    "- skills: extract ALL specific technical skills — programming languages, "
    "frameworks, cloud platforms (AWS, GCP, Azure), databases, tools. "
    "Be thorough. 'AWS developer' -> skills: ['AWS']. "
    "'Python and React engineer' -> skills: ['Python', 'React'].\n"
    "- location: You MUST extract the geographic location if mentioned. "
    "Be aggressive — any city, state, or country reference counts. "
    "'based in new york' -> 'New York'. 'NYC' -> 'New York'. "
    "'SF developer' -> 'San Francisco'. 'from Chicago' -> 'Chicago'. "
    "'located in Austin' -> 'Austin'. Empty string ONLY if no location at all.\n"
    "- min_experience_years: MUST be an integer. For MINIMUM experience: "
    "'10+ years' -> 10, '5 years' -> 5, 'at least 8 years' -> 8, "
    "'senior' with no explicit years -> 5, 'staff' -> 8. "
    "If truly unspecified, use 0.\n"
    "- max_experience_years: MUST be an integer. For MAXIMUM/UPPER-BOUND experience: "
    "'less than 10 years' -> 10, 'under 5 years' -> 5, 'at most 8 years' -> 8, "
    "'below 10 years' -> 10, 'fewer than 3 years' -> 3, "
    "'strictly less than 10' -> 10. If truly unspecified, use 0.\n"
    "- IMPORTANT: 'less than', 'under', 'below', 'at most', 'fewer than' "
    "indicate max_experience_years NOT min_experience_years.\n"
    "- is_strict_skill_match: set to true when the user names specific "
    "technologies. Only false for completely generic queries.\n"
)


CITY_ALIASES: dict[str, str] = {
    "nyc": "New York",
    "new york city": "New York",
    "new york": "New York",
    "sf": "San Francisco",
    "san fran": "San Francisco",
    "la": "Los Angeles",
    "dc": "Washington",
    "chi": "Chicago",
    "atx": "Austin",
    "pdx": "Portland",
    "sea": "Seattle",
    "bos": "Boston",
}

SENIORITY_EXPERIENCE: dict[str, int] = {
    "senior": 5,
    "staff": 8,
    "principal": 12,
    "lead": 5,
    "cto": 12,
}


def _regex_fallback(query: str) -> SearchIntent:
    """Rule-based extraction when Groq is unavailable."""
    q = query.lower()

    # Experience: detect direction first (less than vs at least)
    min_exp = 0
    max_exp = 0

    # "less than 10 years", "under 5 years", "below 10 years", "at most 8 years", "fewer than 3 years"
    max_match = re.search(
        r'(?:less\s+than|under|below|at\s+most|fewer\s+than|strictly\s+less\s+than)\s+(\d+)\+?\s*(?:years?|yrs?)',
        q,
    )
    if max_match:
        max_exp = int(max_match.group(1))
    else:
        # "10+ years", "10 years", "at least 10 years"
        exp_match = re.search(r'(\d+)\+?\s*(?:years?|yrs?)', q)
        min_exp = int(exp_match.group(1)) if exp_match else 0

    # Seniority-to-experience inference when no explicit years
    if min_exp == 0 and max_exp == 0:
        for title, years in SENIORITY_EXPERIENCE.items():
            if title in q:
                min_exp = years
                break

    # Skills: extract BEFORE location so we can reject false-positive locations
    known_skills = [
        "Python", "JavaScript", "TypeScript", "React", "Next.js", "Node.js",
        "Go", "Rust", "Java", "C++", "C#", "Swift", "Kotlin", "Ruby",
        "AWS", "GCP", "Azure", "Docker", "Kubernetes", "Terraform",
        "PostgreSQL", "MongoDB", "Redis", "Kafka", "GraphQL", "REST",
        "FastAPI", "Django", "Flask", "Spring Boot", "Vue", "Angular",
        "TensorFlow", "PyTorch", "Spark", "Airflow", "dbt",
        "Figma", "Solidity", "Playwright", "Cypress", "Selenium",
        "ML", "Machine Learning", "AI", "NLP", "LLM",
        "DevOps", "SRE", "Data Engineering", "React Native",
    ]
    skills = [s for s in known_skills if s.lower() in q]
    _skill_names_lower = frozenset(s.lower() for s in known_skills)

    # Also reject common non-location words the regex might grab
    _non_location_words = _skill_names_lower | frozenset({
        "experience", "years", "engineering", "development", "working",
        "building", "coding", "programming", "developing", "designing",
        "managing", "testing", "deploying", "using", "learning",
    })

    # Location: check city aliases first (these are unambiguous)
    location = ""
    for alias, canonical in CITY_ALIASES.items():
        if alias in q:
            location = canonical
            break

    # Location: try strong signals first ("based in", "located in", "from")
    # then fall back to bare "in" — but always reject if match is a skill/noise
    if not location:
        # Priority 1: explicit location phrases
        loc_match = re.search(
            r'(?:based\s+in|located\s+in|from)\s+'
            r'([a-zA-Z]+(?:\s+[a-zA-Z]+)?(?:,\s*[a-zA-Z]{2})?)',
            query,
            re.IGNORECASE,
        )
        # Priority 2: bare "in <word>" (only if priority 1 didn't match)
        if not loc_match:
            loc_match = re.search(
                r'\bin\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?(?:,\s*[a-zA-Z]{2})?)',
                query,
                re.IGNORECASE,
            )
        if loc_match:
            candidate_loc = loc_match.group(1).strip().rstrip(',')
            # Reject if the captured text is a known skill or noise word
            if candidate_loc.lower() not in _non_location_words:
                location = candidate_loc.title()

    return SearchIntent(
        semantic_query=query,
        skills=skills,
        location=location,
        min_experience_years=min_exp,
        max_experience_years=max_exp,
        is_strict_skill_match=len(skills) > 0,
    )


async def analyze_query(query: str) -> SearchIntent:
    """Parse a natural language search query into structured SearchIntent.

    Tries Groq first, falls back to regex-based extraction.
    """
    try:
        analyzer = _get_analyzer()
        result = await analyzer.ainvoke(
            [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": query},
            ]
        )
        # Validate Groq didn't return empty skills for obvious skill queries
        if not result.skills:
            fallback = _regex_fallback(query)
            if fallback.skills:
                result.skills = fallback.skills
                result.is_strict_skill_match = True
        if result.min_experience_years == 0 and result.max_experience_years == 0:
            fallback_exp = _regex_fallback(query)
            if fallback_exp.min_experience_years > 0:
                result.min_experience_years = fallback_exp.min_experience_years
            if fallback_exp.max_experience_years > 0:
                result.max_experience_years = fallback_exp.max_experience_years
                result.min_experience_years = 0  # max takes precedence
        if not result.location:
            fallback_loc = _regex_fallback(query)
            if fallback_loc.location:
                result.location = fallback_loc.location
        return result
    except Exception:
        return _regex_fallback(query)
