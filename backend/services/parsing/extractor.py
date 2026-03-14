import io
import docx
import pdfplumber


class ExtractionError(Exception):
    """Raised when text extraction fails in a non-recoverable way."""


def _extract_pdf_pdfminer(file_bytes: bytes) -> str:
    """Fallback PDF extraction using pdfminer.six.

    Handles some scanned/image-heavy PDFs that pdfplumber misses.
    """
    from pdfminer.high_level import extract_text as pdfminer_extract
    text = pdfminer_extract(io.BytesIO(file_bytes))
    return text.strip()


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract text from PDF bytes with fallback chain.

    1. Try pdfplumber (best for most PDFs)
    2. If empty → fallback to pdfminer.six (handles different PDF encodings)
    3. If both fail → raise ExtractionError

    Raises ExtractionError for password-protected or unreadable PDFs.
    """
    # ── Attempt 1: pdfplumber ────────────────────────────────────
    try:
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            pages = []
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    pages.append(text)

            if pages:
                return "\n\n".join(pages)
    except Exception as e:
        error_msg = str(e).lower()
        if "password" in error_msg or "encrypted" in error_msg:
            raise ExtractionError("PDF is password-protected")
        # Don't raise yet — try pdfminer fallback

    # ── Attempt 2: pdfminer.six fallback ─────────────────────────
    try:
        text = _extract_pdf_pdfminer(file_bytes)
        if text and len(text) >= 20:
            return text
    except Exception:
        pass  # Both failed — raise below

    raise ExtractionError(
        "Could not extract text from PDF. "
        "The file may be scanned/image-based, corrupted, or empty."
    )


def extract_text_from_docx(file_bytes: bytes) -> str:
    """Extract text from DOCX bytes using python-docx."""
    try:
        doc = docx.Document(io.BytesIO(file_bytes))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        if not paragraphs:
            raise ExtractionError("No text found in DOCX")
        return "\n\n".join(paragraphs)
    except ExtractionError:
        raise
    except Exception as e:
        raise ExtractionError(f"Failed to read DOCX: {e}")


def extract_text(file_bytes: bytes, filename: str) -> str:
    """Route to the correct extractor based on file extension."""
    lower = filename.lower()
    if lower.endswith(".pdf"):
        return extract_text_from_pdf(file_bytes)
    elif lower.endswith(".docx"):
        return extract_text_from_docx(file_bytes)
    else:
        raise ExtractionError(f"Unsupported file type: {filename}")
