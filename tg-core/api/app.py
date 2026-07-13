from __future__ import annotations

import logging
import threading
from contextlib import asynccontextmanager
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, Query, Response, status

from api.formatters import analysis_result_from_row
from api.job_worker import job_worker
from api.schemas import (
    AnalysisDetail,
    AnalysisEventLog,
    AnalysisJob,
    AnalysisRequest,
    HealthResponse,
)
from api.security import require_api_key
from application.jobs import CreateAnalysisJob, create_job
from application.pricing import refresh_and_backfill_model_prices
from infrastructure import analysis_jobs, database, llm_prices

logger = logging.getLogger(__name__)


def start_pricing_refresh() -> None:
    threading.Thread(
        target=_refresh_pricing_safely,
        name="llm-pricing-refresh",
        daemon=True,
    ).start()


def _refresh_pricing_safely() -> None:
    try:
        refresh_and_backfill_model_prices()
    except Exception:
        logger.exception("Background LLM pricing refresh failed")


@asynccontextmanager
async def lifespan(_: FastAPI):
    database.init_database()
    llm_prices.seed_fallback_model_prices()
    analysis_jobs.recover_interrupted_jobs()
    job_worker.start()
    for job_id in analysis_jobs.list_queued_job_ids():
        job_worker.enqueue(job_id)
    start_pricing_refresh()
    try:
        yield
    finally:
        job_worker.stop()


app = FastAPI(
    title="TradingAgents API",
    version="0.1.0",
    description="Run TradingAgents analyses as asynchronous jobs and persist results in PostgreSQL.",
    lifespan=lifespan,
)


@app.get("/health", response_model=HealthResponse)
def health(response: Response) -> HealthResponse:
    try:
        database.healthcheck()
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
        row = create_job(
            CreateAnalysisJob(
                ticker=request.ticker,
                request_id=request.request_id,
                instrument=(
                    request.instrument.model_dump(exclude_none=True)
                    if request.instrument is not None
                    else None
                ),
                trade_date=request.trade_date,
                asset_type=request.asset_type,
                analysts=tuple(request.analysts),
                config_overrides=request.config_overrides,
                output_language=request.output_language,
            )
        )
    except analysis_jobs.RequestIdConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    job_worker.enqueue(row["id"])
    return analysis_jobs.row_to_public(row)


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
    rows = analysis_jobs.list_jobs(
        ticker=ticker_value,
        status=status_filter,
        limit=limit,
        offset=offset,
    )
    return analysis_jobs.rows_to_public(rows)


@app.get(
    "/api/v1/analyses/{job_id}/events",
    response_model=list[AnalysisEventLog],
    dependencies=[Depends(require_api_key)],
)
def get_analysis_events(job_id: UUID) -> list[dict]:
    row = analysis_jobs.get_job(job_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="analysis job not found")
    return list(row.get("events") or [])


@app.get(
    "/api/v1/analyses/{job_id}",
    response_model=AnalysisDetail,
    dependencies=[Depends(require_api_key)],
)
def get_analysis(job_id: UUID) -> dict:
    row = analysis_jobs.get_job(job_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="analysis job not found")
    return analysis_result_from_row(analysis_jobs.row_to_public(row))
