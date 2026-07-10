from __future__ import annotations

import os
from collections.abc import Iterable
from datetime import datetime, timezone
from uuid import UUID

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

DEFAULT_DATABASE_URL = "postgresql://tradingagents:tradingagents@localhost:5432/tradingagents"


def database_url() -> str:
    return os.getenv("TRADINGAGENTS_DATABASE_URL", DEFAULT_DATABASE_URL)


def connect():
    return psycopg.connect(database_url(), row_factory=dict_row)


def init_database() -> None:
    with connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS analysis_jobs (
                id UUID PRIMARY KEY,
                ticker TEXT NOT NULL,
                trade_date DATE NOT NULL,
                asset_type TEXT NOT NULL,
                analysts JSONB NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
                request JSONB NOT NULL,
                config JSONB NOT NULL DEFAULT '{}'::jsonb,
                final_state JSONB,
                decision TEXT,
                error TEXT,
                report_path TEXT,
                tokens_used INTEGER NOT NULL DEFAULT 0,
                token_usage JSONB NOT NULL DEFAULT '{}'::jsonb,
                progress_percent INTEGER NOT NULL DEFAULT 0,
                current_step TEXT,
                events JSONB NOT NULL DEFAULT '[]'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                started_at TIMESTAMPTZ,
                finished_at TIMESTAMPTZ
            )
            """
        )
        conn.execute(
            "ALTER TABLE analysis_jobs ADD COLUMN IF NOT EXISTS progress_percent INTEGER NOT NULL DEFAULT 0"
        )
        conn.execute("ALTER TABLE analysis_jobs ADD COLUMN IF NOT EXISTS current_step TEXT")
        conn.execute(
            "ALTER TABLE analysis_jobs ADD COLUMN IF NOT EXISTS events JSONB NOT NULL DEFAULT '[]'::jsonb"
        )
        conn.execute(
            "ALTER TABLE analysis_jobs ADD COLUMN IF NOT EXISTS tokens_used INTEGER NOT NULL DEFAULT 0"
        )
        conn.execute(
            "ALTER TABLE analysis_jobs ADD COLUMN IF NOT EXISTS token_usage JSONB NOT NULL DEFAULT '{}'::jsonb"
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS analysis_jobs_ticker_created_idx
            ON analysis_jobs (ticker, created_at DESC)
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS analysis_jobs_status_created_idx
            ON analysis_jobs (status, created_at DESC)
            """
        )


def healthcheck() -> None:
    with connect() as conn:
        conn.execute("SELECT 1")


def insert_job(
    *,
    job_id: UUID,
    ticker: str,
    trade_date: str,
    asset_type: str,
    analysts: list[str],
    request: dict,
    config: dict,
) -> dict:
    with connect() as conn:
        row = conn.execute(
            """
            INSERT INTO analysis_jobs (
                id, ticker, trade_date, asset_type, analysts, status, request, config,
                progress_percent, current_step, events, tokens_used, token_usage
            )
            VALUES (%s, %s, %s, %s, %s, 'queued', %s, %s, 0, 'Queued', '[]'::jsonb, 0, '{}'::jsonb)
            RETURNING *
            """,
            (
                job_id,
                ticker,
                trade_date,
                asset_type,
                Jsonb(analysts),
                Jsonb(request),
                Jsonb(config),
            ),
        ).fetchone()
    return row


def get_job(job_id: UUID | str) -> dict | None:
    with connect() as conn:
        return conn.execute("SELECT * FROM analysis_jobs WHERE id = %s", (job_id,)).fetchone()


def list_jobs(
    *,
    ticker: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT *
            FROM analysis_jobs
            WHERE (%s::text IS NULL OR ticker = %s)
              AND (%s::text IS NULL OR status = %s)
            ORDER BY created_at DESC
            LIMIT %s OFFSET %s
            """,
            (ticker, ticker, status, status, limit, offset),
        ).fetchall()
    return list(rows)


def mark_running(job_id: UUID | str) -> None:
    with connect() as conn:
        conn.execute(
            """
            UPDATE analysis_jobs
            SET status = 'running',
                started_at = COALESCE(started_at, now()),
                updated_at = now(),
                progress_percent = GREATEST(progress_percent, 1),
                current_step = 'Starting analysis',
                error = NULL
            WHERE id = %s
            """,
            (job_id,),
        )


def update_progress(
    *,
    job_id: UUID | str,
    progress_percent: int,
    current_step: str,
    event: dict | None = None,
) -> None:
    progress = max(0, min(99, int(progress_percent)))
    payload = event or {
        "time": datetime.now(timezone.utc).isoformat(),
        "progress_percent": progress,
        "message": current_step,
    }
    with connect() as conn:
        conn.execute(
            """
            UPDATE analysis_jobs
            SET progress_percent = GREATEST(progress_percent, %s),
                current_step = %s,
                events = COALESCE(events, '[]'::jsonb) || %s::jsonb,
                updated_at = now()
            WHERE id = %s
            """,
            (progress, current_step, Jsonb([payload]), job_id),
        )


def total_tokens(token_usage: dict | None) -> int:
    if not token_usage:
        return 0
    return int(token_usage.get("total_tokens") or token_usage.get("total") or 0)


def mark_succeeded(
    *,
    job_id: UUID | str,
    final_state: dict,
    decision: str,
    report_path: str | None,
    token_usage: dict | None = None,
) -> None:
    usage = token_usage or {}
    with connect() as conn:
        conn.execute(
            """
            UPDATE analysis_jobs
            SET status = 'succeeded',
                final_state = %s,
                decision = %s,
                report_path = %s,
                tokens_used = %s,
                token_usage = %s,
                progress_percent = 100,
                current_step = 'Completed',
                finished_at = now(),
                updated_at = now(),
                error = NULL
            WHERE id = %s
            """,
            (Jsonb(final_state), decision, report_path, total_tokens(usage), Jsonb(usage), job_id),
        )


def mark_failed(*, job_id: UUID | str, error: str, token_usage: dict | None = None) -> None:
    usage = token_usage or {}
    with connect() as conn:
        conn.execute(
            """
            UPDATE analysis_jobs
            SET status = 'failed',
                error = %s,
                tokens_used = %s,
                token_usage = %s,
                current_step = 'Failed',
                finished_at = now(),
                updated_at = now()
            WHERE id = %s
            """,
            (error, total_tokens(usage), Jsonb(usage), job_id),
        )


def rows_to_public(rows: Iterable[dict]) -> list[dict]:
    return [row_to_public(row) for row in rows]


def row_to_public(row: dict) -> dict:
    public = dict(row)
    public["analysts"] = list(public.get("analysts") or [])
    public["events"] = list(public.get("events") or [])
    public["token_usage"] = dict(public.get("token_usage") or {})
    public["tokens_used"] = int(public.get("tokens_used") or 0)
    return public