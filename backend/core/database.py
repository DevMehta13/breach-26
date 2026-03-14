import ssl
from uuid import uuid4

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool
from backend.core.config import get_settings


settings = get_settings()


def _to_async_url(url: str) -> str:
    """Convert any postgresql:// URL to use the asyncpg driver."""
    if "asyncpg" not in url:
        return url.replace("postgresql://", "postgresql+asyncpg://", 1).replace(
            "postgresql+psycopg2://", "postgresql+asyncpg://", 1
        )
    return url


# Supabase pooler (pgbouncer in transaction mode) requires:
# 1. NullPool — let pgbouncer handle connection pooling, not SQLAlchemy
# 2. prepared_statement_cache_size=0 — disable SQLAlchemy's PS cache
# 3. prepared_statement_name_func — unique names to avoid pgbouncer clashes
# 4. statement_cache_size=0 — disable asyncpg's PS cache
# 5. SSL context — required for Supabase connections
_ssl_ctx = ssl.create_default_context()
_ssl_ctx.check_hostname = False
_ssl_ctx.verify_mode = ssl.CERT_NONE

engine = create_async_engine(
    _to_async_url(settings.DATABASE_URL),
    echo=False,
    poolclass=NullPool,
    connect_args={
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
        "prepared_statement_name_func": lambda: f"_pg_{uuid4().hex[:12]}",
        "ssl": _ssl_ctx,
    },
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
