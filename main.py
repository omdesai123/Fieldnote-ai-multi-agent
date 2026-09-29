"""
FastAPI backend for the AI Research Report Generator.

This file is the ONLY new backend file. It wraps your existing LangChain
pipeline (agents.py, pipline.py, tools.py) with a REST API and serves the
HTML/CSS/JS frontend. None of your original pipeline logic was changed.
"""

import asyncio
import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

# Your existing pipeline function — untouched.
from pipline import run_research_pipeline

# ---------- Logging ----------

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("research_api")

# ---------- App setup ----------

app = FastAPI(
    title="AI Research Report Generator",
    description="Multi-agent research pipeline (search -> read -> write -> critique) exposed as an API.",
    version="1.0.0",
)

# CORS is open here because the frontend is served from this same app.
# Restrict allow_origins if you later split frontend and backend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


# ---------- Pydantic models (request/response validation) ----------

class ResearchRequest(BaseModel):
    topic: str = Field(
        ...,
        min_length=3,
        max_length=300,
        description="The topic to research.",
        examples=["The future of solid-state batteries"],
    )


class ResearchResponse(BaseModel):
    topic: str
    search_results: str
    scraped_content: str
    report: str
    feedback: str


class ErrorResponse(BaseModel):
    detail: str


# ---------- Routes ----------

@app.get("/", response_class=HTMLResponse, include_in_schema=False)
async def serve_index(request: Request):
    """Serve the single-page frontend."""
    return templates.TemplateResponse(request=request, name="index.html")


@app.get("/api/health", tags=["meta"])
async def health_check():
    """Basic liveness check."""
    return {"status": "ok"}


@app.post(
    "/api/research",
    response_model=ResearchResponse,
    responses={500: {"model": ErrorResponse}, 400: {"model": ErrorResponse}},
    tags=["research"],
)
async def create_research_report(payload: ResearchRequest):
    """
    Run the full multi-agent research pipeline for a topic:
    search agent -> reader agent -> writer chain -> critic chain.

    This calls your existing `run_research_pipeline` unmodified. Because that
    function makes blocking LLM/network calls, it is run in a worker thread
    so it doesn't block the FastAPI event loop.
    """
    topic = payload.topic.strip()
    if not topic:
        raise HTTPException(status_code=400, detail="Topic cannot be empty.")

    logger.info("Starting research pipeline for topic: %s", topic)

    try:
        state = await asyncio.to_thread(run_research_pipeline, topic)
    except Exception as exc:  # noqa: BLE001 - surface pipeline errors to the client
        logger.exception("Pipeline failed for topic '%s'", topic)
        raise HTTPException(
            status_code=500,
            detail=f"Research pipeline failed: {exc}",
        ) from exc

    return ResearchResponse(
        topic=topic,
        search_results=state.get("search_results", ""),
        scraped_content=state.get("scraped_content", ""),
        report=state.get("report", ""),
        feedback=state.get("feedback", ""),
    )
