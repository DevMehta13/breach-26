from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.auth import get_current_user
from backend.core.database import get_db
from backend.models.user import User
from backend.schemas.search import SearchRequest, SearchResponse, SearchResultItem
from backend.services.workflows.search_graph import search_graph

router = APIRouter(prefix="/api/search", tags=["Search"])


@router.post("", response_model=SearchResponse)
async def search_candidates(
    body: SearchRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Natural language candidate search powered by Groq + pgvector."""
    result = await search_graph.ainvoke({
        "user_query": body.query,
        "session": db,
    })

    return SearchResponse(
        query=body.query,
        intent=result.get("intent", {}),
        total=len(result.get("results", [])),
        results=[
            SearchResultItem(**r) for r in result.get("results", [])
        ],
    )
