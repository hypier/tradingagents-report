from __future__ import annotations

import os
from collections.abc import Iterable
from contextlib import contextmanager
from datetime import datetime, timezone
from uuid import UUID

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from tradingagents.api.pricing import (
    FALLBACK_MODEL_PRICES,
    PRICING_REFRESH_INTERVAL,
    PRICING_SOURCE_URLS,
    calculate_cost,
    fetch_price_rows,
    pricing_is_stale,
)

DEFAULT_DATABASE_URL = "postgresql://tradingagents:tradingagents@localhost:5432/tradingagents"
ANALYSIS_LOCK_KEY = 8_724_631_904


def database_url() -> str:
    return os.getenv("TRADINGAGENTS_DATABASE_URL", DEFAULT_DATABASE_URL)


def connect(*, autocommit: bool = False):
    return psycopg.connect(database_url(), autocommit=autocommit, row_factory=dict_row)


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
                cost_usd NUMERIC(18, 8) NOT NULL DEFAULT 0,
                cost_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
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
            "ALTER TABLE analysis_jobs ADD COLUMN IF NOT EXISTS cost_usd NUMERIC(18, 8) NOT NULL DEFAULT 0"
        )
        conn.execute(
            "ALTER TABLE analysis_jobs ADD COLUMN IF NOT EXISTS cost_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb"
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS llm_model_prices (
                provider TEXT NOT NULL,
                model TEXT NOT NULL,
                billing_mode TEXT NOT NULL DEFAULT 'standard',
                context_tier TEXT NOT NULL DEFAULT 'short',
                currency TEXT NOT NULL DEFAULT 'USD',
                unit_tokens INTEGER NOT NULL DEFAULT 1000000,
                input_price NUMERIC(18, 8) NOT NULL,
                cached_input_price NUMERIC(18, 8),
                cache_write_price NUMERIC(18, 8),
                output_price NUMERIC(18, 8) NOT NULL,
                source_url TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                PRIMARY KEY (provider, model, billing_mode, context_tier)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS llm_pricing_sources (
                source_url TEXT PRIMARY KEY,
                update_interval_seconds INTEGER NOT NULL DEFAULT 3600,
                last_checked_at TIMESTAMPTZ,
                last_success_at TIMESTAMPTZ,
                last_error TEXT,
                model_count INTEGER NOT NULL DEFAULT 0,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        seed_fallback_model_prices(conn)
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
                progress_percent, current_step, events, tokens_used, token_usage, cost_usd, cost_breakdown
            )
            VALUES (%s, %s, %s, %s, %s, 'queued', %s, %s, 0, 'Queued', '[]'::jsonb, 0, '{}'::jsonb, 0, '{}'::jsonb)
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


@contextmanager
def analysis_execution_lock():
    """Serialize graph runs across API processes that share the database."""
    with connect(autocommit=True) as conn:
        conn.execute("SELECT pg_advisory_lock(%s)", (ANALYSIS_LOCK_KEY,))
        try:
            yield
        finally:
            conn.execute("SELECT pg_advisory_unlock(%s)", (ANALYSIS_LOCK_KEY,))


def claim_job(job_id: UUID | str) -> dict | None:
    with connect() as conn:
        return conn.execute(
            """
            UPDATE analysis_jobs
            SET status = 'running',
                started_at = COALESCE(started_at, now()),
                updated_at = now(),
                progress_percent = GREATEST(progress_percent, 1),
                current_step = 'Starting analysis',
                error = NULL
            WHERE id = %s AND status = 'queued'
            RETURNING *
            """,
            (job_id,),
        ).fetchone()


def recover_interrupted_jobs() -> int:
    """Fail orphaned running jobs when no analysis process currently owns the lock."""
    with connect() as conn:
        lock_row = conn.execute(
            "SELECT pg_try_advisory_lock(%s) AS acquired",
            (ANALYSIS_LOCK_KEY,),
        ).fetchone()
        if not lock_row or not lock_row["acquired"]:
            return 0
        try:
            cursor = conn.execute(
                """
                UPDATE analysis_jobs
                SET status = 'failed',
                    error = COALESCE(error, 'Analysis interrupted by API process restart'),
                    current_step = 'Failed',
                    finished_at = now(),
                    updated_at = now()
                WHERE status = 'running'
                """
            )
            conn.commit()
            return cursor.rowcount
        finally:
            conn.execute("SELECT pg_advisory_unlock(%s)", (ANALYSIS_LOCK_KEY,))


def list_queued_job_ids() -> list[UUID]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT id FROM analysis_jobs WHERE status = 'queued' ORDER BY created_at"
        ).fetchall()
    return [row["id"] for row in rows]


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


def seed_fallback_model_prices(conn) -> None:
    for price in FALLBACK_MODEL_PRICES:
        conn.execute(
            """
            INSERT INTO llm_model_prices (
                provider, model, billing_mode, context_tier, currency, unit_tokens,
                input_price, cached_input_price, cache_write_price, output_price, source_url
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (provider, model, billing_mode, context_tier)
            DO UPDATE SET
                currency = EXCLUDED.currency,
                unit_tokens = EXCLUDED.unit_tokens,
                input_price = EXCLUDED.input_price,
                cached_input_price = EXCLUDED.cached_input_price,
                cache_write_price = EXCLUDED.cache_write_price,
                output_price = EXCLUDED.output_price,
                source_url = EXCLUDED.source_url,
                updated_at = now()
            """,
            (
                price["provider"],
                price["model"],
                price["billing_mode"],
                price["context_tier"],
                price["currency"],
                price["unit_tokens"],
                price["input_price"],
                price["cached_input_price"],
                price["cache_write_price"],
                price["output_price"],
                price["source_url"],
            ),
        )


def refresh_model_prices_if_stale(conn=None) -> None:
    close_conn = conn is None
    if conn is None:
        conn = connect()
    try:
        latest_success = conn.execute(
            "SELECT max(last_success_at) AS last_success_at FROM llm_pricing_sources"
        ).fetchone()
        if not pricing_is_stale(latest_success.get("last_success_at") if latest_success else None):
            return

        price_rows, source_results = fetch_price_rows(PRICING_SOURCE_URLS)
        now_sql = "now()"
        for result in source_results:
            conn.execute(
                f"""
                INSERT INTO llm_pricing_sources (
                    source_url, update_interval_seconds, last_checked_at, last_success_at,
                    last_error, model_count, updated_at
                )
                VALUES (%s, %s, {now_sql}, CASE WHEN %s THEN {now_sql} ELSE NULL END, %s, %s, {now_sql})
                ON CONFLICT (source_url)
                DO UPDATE SET
                    update_interval_seconds = EXCLUDED.update_interval_seconds,
                    last_checked_at = {now_sql},
                    last_success_at = CASE
                        WHEN EXCLUDED.last_success_at IS NULL
                        THEN llm_pricing_sources.last_success_at
                        ELSE EXCLUDED.last_success_at
                    END,
                    last_error = EXCLUDED.last_error,
                    model_count = EXCLUDED.model_count,
                    updated_at = {now_sql}
                """,
                (
                    result["source_url"],
                    int(PRICING_REFRESH_INTERVAL.total_seconds()),
                    result["success"],
                    result["error"],
                    result["model_count"],
                ),
            )

        for price in price_rows:
            upsert_model_price(conn, price)
        if close_conn:
            conn.commit()
    except Exception:
        if close_conn:
            conn.rollback()
        return
    finally:
        if close_conn:
            conn.close()


def upsert_model_price(conn, price: dict) -> None:
    conn.execute(
        """
        INSERT INTO llm_model_prices (
            provider, model, billing_mode, context_tier, currency, unit_tokens,
            input_price, cached_input_price, cache_write_price, output_price, source_url
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (provider, model, billing_mode, context_tier)
        DO UPDATE SET
            currency = EXCLUDED.currency,
            unit_tokens = EXCLUDED.unit_tokens,
            input_price = EXCLUDED.input_price,
            cached_input_price = EXCLUDED.cached_input_price,
            cache_write_price = EXCLUDED.cache_write_price,
            output_price = EXCLUDED.output_price,
            source_url = EXCLUDED.source_url,
            updated_at = now()
        """,
        (
            price["provider"],
            price["model"],
            price["billing_mode"],
            price["context_tier"],
            price["currency"],
            price["unit_tokens"],
            price["input_price"],
            price["cached_input_price"],
            price["cache_write_price"],
            price["output_price"],
            price["source_url"],
        ),
    )


def backfill_analysis_costs(conn) -> None:
    jobs = conn.execute(
        """
        SELECT id, token_usage, COALESCE(config->>'llm_provider', 'openai') AS provider
        FROM analysis_jobs
        WHERE token_usage <> '{}'::jsonb
        """
    ).fetchall()
    prices_by_provider: dict[str, list[dict]] = {}
    for job in jobs:
        provider = str(job.get("provider") or "openai")
        if provider not in prices_by_provider:
            prices_by_provider[provider] = list(
                conn.execute(
                    """
                    SELECT *
                    FROM llm_model_prices
                    WHERE provider = %s
                      AND billing_mode = 'standard'
                      AND context_tier = 'short'
                    """,
                    (provider,),
                ).fetchall()
            )
        cost_breakdown = calculate_cost(
            dict(job.get("token_usage") or {}),
            prices_by_provider[provider],
        )
        conn.execute(
            """
            UPDATE analysis_jobs
            SET cost_usd = %s,
                cost_breakdown = %s,
                updated_at = updated_at
            WHERE id = %s
            """,
            (cost_breakdown["total_cost_usd"], Jsonb(cost_breakdown), job["id"]),
        )


def get_model_prices(
    *,
    provider: str = "openai",
    billing_mode: str = "standard",
    context_tier: str = "short",
) -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT *
            FROM llm_model_prices
            WHERE provider = %s
              AND billing_mode = %s
              AND context_tier = %s
            """,
            (provider, billing_mode, context_tier),
        ).fetchall()
    return list(rows)


def refresh_and_backfill_model_prices() -> None:
    with connect() as conn:
        refresh_model_prices_if_stale(conn)
        backfill_analysis_costs(conn)


def cost_for_usage(
    token_usage: dict | None,
    *,
    provider: str = "openai",
    billing_mode: str = "standard",
    context_tier: str = "short",
) -> dict:
    return calculate_cost(
        token_usage,
        get_model_prices(provider=provider, billing_mode=billing_mode, context_tier=context_tier),
    )


def mark_succeeded(
    *,
    job_id: UUID | str,
    final_state: dict,
    decision: str,
    report_path: str | None,
    token_usage: dict | None = None,
    provider: str,
) -> None:
    usage = token_usage or {}
    cost_breakdown = cost_for_usage(usage, provider=provider)
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
                cost_usd = %s,
                cost_breakdown = %s,
                progress_percent = 100,
                current_step = 'Completed',
                finished_at = now(),
                updated_at = now(),
                error = NULL
            WHERE id = %s
            """,
            (
                Jsonb(final_state),
                decision,
                report_path,
                total_tokens(usage),
                Jsonb(usage),
                cost_breakdown["total_cost_usd"],
                Jsonb(cost_breakdown),
                job_id,
            ),
        )


def mark_failed(
    *,
    job_id: UUID | str,
    error: str,
    token_usage: dict | None = None,
    provider: str,
) -> None:
    usage = token_usage or {}
    cost_breakdown = cost_for_usage(usage, provider=provider)
    with connect() as conn:
        conn.execute(
            """
            UPDATE analysis_jobs
            SET status = 'failed',
                error = %s,
                tokens_used = %s,
                token_usage = %s,
                cost_usd = %s,
                cost_breakdown = %s,
                current_step = 'Failed',
                finished_at = now(),
                updated_at = now()
            WHERE id = %s
            """,
            (
                error,
                total_tokens(usage),
                Jsonb(usage),
                cost_breakdown["total_cost_usd"],
                Jsonb(cost_breakdown),
                job_id,
            ),
        )


def rows_to_public(rows: Iterable[dict]) -> list[dict]:
    return [row_to_public(row) for row in rows]


def row_to_public(row: dict) -> dict:
    public = dict(row)
    public["analysts"] = list(public.get("analysts") or [])
    public["events"] = list(public.get("events") or [])
    public["token_usage"] = dict(public.get("token_usage") or {})
    public["tokens_used"] = int(public.get("tokens_used") or 0)
    public["cost_usd"] = float(public.get("cost_usd") or 0)
    public["cost_breakdown"] = dict(public.get("cost_breakdown") or {})
    return public
