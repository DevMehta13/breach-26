from google import genai
from google.genai import types
from backend.core.config import get_settings

_client = None


def _get_client():
    global _client
    if _client is None:
        settings = get_settings()
        _client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _client


def generate_embedding(text: str) -> list[float]:
    """Generate a 768-dimensional embedding vector for the given text."""
    client = _get_client()
    result = client.models.embed_content(
        model="gemini-embedding-001",
        contents=text,
        config=types.EmbedContentConfig(output_dimensionality=768),
    )
    return list(result.embeddings[0].values)
