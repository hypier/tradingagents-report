from __future__ import annotations

from contextlib import asynccontextmanager
from uuid import UUID

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, status

from tradingagents.api import db
from tradingagents.api.formatters import analysis_document_from_row
from tradingagents.api.schemas import AnalysisJob, AnalysisRequest, HealthResponse
from tradingagents.api.service import create_analysis_job, run_analysis_job


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init_database()
    yield


app = FastAPI(
    title="TradingAgents API",
    version="0.1.0",
    description="Run TradingAgents analyses as asynchronous jobs and persist results in PostgreSQL.",
    lifespan=lifespan,
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    try:
        db.healthcheck()
        return HealthResponse(status="ok", database="ok")
    except Exception as exc:
        return HealthResponse(status="error", database="error", detail=str(exc))


@app.post(
    "/api/v1/analyses",
    response_model=AnalysisJob,
    status_code=status.HTTP_202_ACCEPTED,
)
def submit_analysis(request: AnalysisRequest, background_tasks: BackgroundTasks) -> dict:
    try:
        row = create_analysis_job(request)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    background_tasks.add_task(run_analysis_job, row["id"])
    return db.row_to_public(row)


@app.get("/api/v1/analyses", response_model=list[AnalysisJob])
def get_analyses(
    ticker: str | None = Query(default=None, min_length=1, max_length=32),
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[dict]:
    ticker_value = ticker.upper() if ticker else None
    rows = db.list_jobs(ticker=ticker_value, status=status_filter, limit=limit, offset=offset)
    return db.rows_to_public(rows)


@app.get("/api/v1/analyses/{job_id}")
def get_analysis(job_id: UUID) -> dict:
    row = db.get_job(job_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="analysis job not found")
    return analysis_document_from_row(db.row_to_public(row))

