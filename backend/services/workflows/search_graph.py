"""LangGraph search workflow.

State: user_query -> intent (SearchIntent) -> results (list of candidates)
Nodes: analyze_query -> execute_search
"""

from __future__ import annotations

from typing import TypedDict
from langgraph.graph import StateGraph, END

from backend.services.search.query_analyzer import SearchIntent, analyze_query
from backend.services.search.semantic_search import search_candidates

from sqlalchemy.ext.asyncio import AsyncSession


class SearchState(TypedDict, total=False):
    user_query: str
    intent: dict
    results: list[dict]
    session: AsyncSession
    error: str | None


async def analyze_query_node(state: SearchState) -> dict:
    """Use Groq to parse the user query into structured SearchIntent."""
    try:
        intent = await analyze_query(state["user_query"])
        return {"intent": intent.model_dump()}
    except Exception as e:
        # Fallback: use raw query as semantic search only
        fallback = SearchIntent(semantic_query=state["user_query"])
        return {"intent": fallback.model_dump(), "error": f"Query analysis fallback: {e}"}


async def execute_search_node(state: SearchState) -> dict:
    """Run combined semantic + filter search."""
    try:
        intent = SearchIntent(**state["intent"])
        results = await search_candidates(
            session=state["session"],
            intent=intent,
        )
        return {"results": results}
    except Exception as e:
        return {"results": [], "error": f"Search failed: {e}"}


# Build the graph
_builder = StateGraph(SearchState)
_builder.add_node("analyze_query", analyze_query_node)
_builder.add_node("execute_search", execute_search_node)

_builder.set_entry_point("analyze_query")
_builder.add_edge("analyze_query", "execute_search")
_builder.add_edge("execute_search", END)

search_graph = _builder.compile()
