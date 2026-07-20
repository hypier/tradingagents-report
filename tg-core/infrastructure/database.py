from __future__ import annotations

import os
from collections.abc import Iterator
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row

DATABASE_URL_ENV_VAR = "TRADINGAGENTS_DATABASE_URL"
ANALYSIS_LOCK_KEY = 8_724_631_904
_REQUIRED_TABLES = ("analysis_jobs", "llm_model_prices", "llm_pricing_sources")
_REQUIRED_CREDIT_RESERVATION_COLUMNS = (
    "estimated_cost_usd",
    "pricing_snapshot",
    "settled_units",
    "settled_cost_usd",
)


def database_url() -> str:
    url = os.getenv(DATABASE_URL_ENV_VAR, "").strip()
    if not url:
        raise RuntimeError(f"{DATABASE_URL_ENV_VAR} must be configured in .env")
    return url


def connect(*, autocommit: bool = False):
    return psycopg.connect(database_url(), autocommit=autocommit, row_factory=dict_row)


def require_schema() -> None:
    """Fail fast when tg-web migrations have not been applied yet."""
    with connect() as conn:
        row = conn.execute(
            """
            SELECT COUNT(*)::int AS n
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = ANY(%s)
            """,
            (list(_REQUIRED_TABLES),),
        ).fetchone()
        column_row = conn.execute(
            """
            SELECT COUNT(*)::int AS n
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'credit_reservations'
              AND column_name = ANY(%s)
            """,
            (list(_REQUIRED_CREDIT_RESERVATION_COLUMNS),),
        ).fetchone()
    found = int((row or {}).get("n") or 0)
    found_columns = int((column_row or {}).get("n") or 0)
    if (
        found < len(_REQUIRED_TABLES)
        or found_columns < len(_REQUIRED_CREDIT_RESERVATION_COLUMNS)
    ):
        raise RuntimeError(
            "PostgreSQL schema is missing required tables. "
            "Run tg-web migrations first: cd tg-web && pnpm db:migrate"
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
