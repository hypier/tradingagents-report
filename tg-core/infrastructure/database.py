from __future__ import annotations

import os
from collections.abc import Iterator
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row

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


@contextmanager
def analysis_execution_lock() -> Iterator[None]:
    with connect(autocommit=True) as conn:
        conn.execute("SELECT pg_advisory_lock(%s)", (ANALYSIS_LOCK_KEY,))
        try:
            yield
        finally:
            conn.execute("SELECT pg_advisory_unlock(%s)", (ANALYSIS_LOCK_KEY,))
