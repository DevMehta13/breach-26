"""Map HRMS (BambooHR/Workday) field structures to our internal schema.

HRMS systems return employee records with their own field names:
  - employee_id, employee_number
  - work_email, personal_email
  - jobTitle, job_title
  - department, division
  - hireDate, hire_date
  - workPhone, mobilePhone

This module normalizes them into our ParsedResume-compatible dict
and generates a raw_text representation for Gemini parsing.
"""

from __future__ import annotations


def hrms_record_to_candidate(record: dict) -> dict:
    """Convert an HRMS employee record to our candidate dict format.

    Handles both BambooHR and Workday-style field names.
    Returns a dict compatible with ParsedResume schema fields.
    """
    return {
        "full_name": (
            record.get("full_name")
            or f"{record.get('firstName', '')} {record.get('lastName', '')}".strip()
            or "Unknown"
        ),
        "email": (
            record.get("email")
            or record.get("work_email")
            or record.get("workEmail")
            or record.get("personal_email")
            or record.get("homeEmail")
        ),
        "phone": (
            record.get("phone")
            or record.get("work_phone")
            or record.get("workPhone")
            or record.get("mobilePhone")
        ),
        "location": (
            record.get("location")
            or record.get("work_location")
            or record.get("office")
        ),
        "current_title": (
            record.get("current_title")
            or record.get("jobTitle")
            or record.get("job_title")
        ),
        "department": (
            record.get("department")
            or record.get("division")
        ),
        "years_experience": record.get("years_experience"),
        "skills": record.get("skills", []),
        "education": record.get("education", []),
        "experience": record.get("experience", []),
        "employee_id": (
            record.get("employee_id")
            or record.get("employee_number")
            or record.get("id")
        ),
    }


def candidate_to_raw_text(candidate: dict) -> str:
    """Convert a structured candidate dict into raw text for the Gemini parser.

    This is used when HRMS provides structured data that still needs
    to be run through the AI parser for normalization and enrichment.
    """
    lines = [
        candidate.get("full_name", "Unknown"),
        "",
    ]

    contact_parts = []
    if candidate.get("email"):
        contact_parts.append(candidate["email"])
    if candidate.get("phone"):
        contact_parts.append(candidate["phone"])
    if candidate.get("location"):
        contact_parts.append(candidate["location"])
    if contact_parts:
        lines.append(" | ".join(contact_parts))
        lines.append("")

    if candidate.get("current_title"):
        title_line = f"Current Role: {candidate['current_title']}"
        if candidate.get("department"):
            title_line += f", {candidate['department']}"
        lines.append(title_line)

    if candidate.get("years_experience") is not None:
        lines.append(f"Years of Experience: {candidate['years_experience']}")

    lines.append("")

    if candidate.get("skills"):
        lines.append("SKILLS")
        lines.append(", ".join(candidate["skills"]))
        lines.append("")

    if candidate.get("experience"):
        lines.append("EXPERIENCE")
        for exp in candidate["experience"]:
            lines.append(
                f"{exp.get('title', '')} — {exp.get('company', '')} "
                f"({exp.get('duration', '')})"
            )
            if exp.get("description"):
                lines.append(f"  {exp['description']}")
            lines.append("")

    if candidate.get("education"):
        lines.append("EDUCATION")
        for edu in candidate["education"]:
            parts = []
            if edu.get("degree"):
                parts.append(edu["degree"])
            if edu.get("field_of_study"):
                parts.append(edu["field_of_study"])
            if edu.get("institution"):
                parts.append(f"— {edu['institution']}")
            if edu.get("year"):
                parts.append(f"({edu['year']})")
            lines.append(" ".join(parts))

    return "\n".join(lines)
