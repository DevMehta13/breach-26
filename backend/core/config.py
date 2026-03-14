from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache

# Look for .env in both project root and backend/ (local dev vs Render)
_env_files = [p for p in (Path("backend/.env"), Path(".env")) if p.is_file()]


class Settings(BaseSettings):
    DATABASE_URL: str
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.0-flash"
    GROQ_API_KEY: str = ""
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:3000/login/callback"
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    GMAIL_CREDENTIALS_JSON: str = ""
    BAMBOOHR_API_KEY: str = ""
    BAMBOOHR_SUBDOMAIN: str = ""
    MOCK_HRMS_ENABLED: bool = True
    MOCK_GMAIL_ENABLED: bool = True

    model_config = {"env_file": _env_files or ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
