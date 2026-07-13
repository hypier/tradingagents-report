from __future__ import annotations

import logging
import threading
from contextlib import asynccontextmanager
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, Query, Response, status

from tradingagents.api import db
from tradingagents.api.formatters import analysis_document_from_row
from tradingagents.api.runner import job_runner
from tradingagents.api.schemas import AnalysisJob, AnalysisRequest, HealthResponse
from tradingagents.api.security import require_api_key
from tradingagents.api.service import create_analysis_job

logger = logging.getLogger(__name__)


def start_pricing_refresh() -> None:
    threading.Thread(
        target=_refresh_pricing_safely,
        name="llm-pricing-refresh",
        daemon=True,
    ).start()


def _refresh_pricing_safely() -> None:
    try:
        db.refresh_and_backfill_model_prices()
    except Exception:
        logger.exception("Background LLM pricing refresh failed")


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init_database()
    db.recover_interrupted_jobs()
    job_runner.start()
    for job_id in db.list_queued_job_ids():
        job_runner.enqueue(job_id)
    start_pricing_refresh()
    try:
        yield
    finally:
        job_runner.stop()


app = FastAPI(
    title="TradingAgents API",
    version="0.1.0",
    description=(
        "Run TradingAgents analyses as asynchronous jobs and persist results in PostgreSQL.\n\n"
        "Authenticated endpoints require this request header:\n\n"
        "`X-API-Key: <TRADINGAGENTS_API_KEY>`"
    ),
    lifespan=lifespan,
)


@app.get("/health", response_model=HealthResponse)
def health(response: Response) -> HealthResponse:
    try:
        db.healthcheck()
        return HealthResponse(status="ok", database="ok")
    except Exception as exc:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return HealthResponse(status="error", database="error", detail=str(exc))


@app.post(
    "/api/v1/analyses",
    response_model=AnalysisJob,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_api_key)],
)
def submit_analysis(request: AnalysisRequest) -> dict:
    try:
        row = create_analysis_job(request)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    job_runner.enqueue(row["id"])
    return db.row_to_public(row)


@app.get(
    "/api/v1/analyses",
    response_model=list[AnalysisJob],
    dependencies=[Depends(require_api_key)],
)
def get_analyses(
    ticker: str | None = Query(default=None, min_length=1, max_length=32),
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[dict]:
    ticker_value = ticker.upper() if ticker else None
    rows = db.list_jobs(ticker=ticker_value, status=status_filter, limit=limit, offset=offset)
    return db.rows_to_public(rows)


@app.get("/api/v1/analyses/{job_id}", dependencies=[Depends(require_api_key)])
def get_analysis(job_id: UUID) -> dict:
    row = db.get_job(job_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="analysis job not found")
    return analysis_document_from_row(db.row_to_public(row))
