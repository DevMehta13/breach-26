from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.api.health import router as health_router
from backend.api.auth import router as auth_router
from backend.api.ingest import router as ingest_router
from backend.api.dedup import router as dedup_router
from backend.api.sources import router as sources_router
from backend.api.search import router as search_router
from backend.api.candidates import router as candidates_router
from backend.api.shortlists import router as shortlists_router
from backend.api.activity import router as activity_router
from backend.api.analytics import router as analytics_router
from backend.api.jobs import router as jobs_router
from backend.api.employees import router as employees_router
from backend.api.referrals import router as referrals_router
from backend.api.ws import router as ws_router

app = FastAPI(
    title="AI Recruitment Platform",
    description="Unified AI-Powered Recruitment Hub",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, tags=["Health"])
app.include_router(auth_router)
app.include_router(ingest_router)
app.include_router(dedup_router)
app.include_router(sources_router)
app.include_router(search_router)
app.include_router(candidates_router)
app.include_router(shortlists_router)
app.include_router(activity_router)
app.include_router(analytics_router)
app.include_router(jobs_router)
app.include_router(employees_router)
app.include_router(referrals_router)
app.include_router(ws_router)
