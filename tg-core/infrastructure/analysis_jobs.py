from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from psycopg.types.json import Jsonb

from infrastructure import database


def claim_job(job_id: UUID | str) -> dict | None:
    with database.connect() as conn:
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
    """Fail orphaned running jobs when no analysis process owns the lock."""
    with database.connect() as conn:
        lock_row = conn.execute(
            "SELECT pg_try_advisory_lock(%s) AS acquired",
            (database.ANALYSIS_LOCK_KEY,),
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
            conn.execute("SELECT pg_advisory_unlock(%s)", (database.ANALYSIS_LOCK_KEY,))


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
    with database.connect() as conn:
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


def mark_succeeded(
    *,
    job_id: UUID | str,
    final_state: dict,
    decision: str,
    report_path: str | None,
    token_usage: dict | None,
    cost_breakdown: dict,
) -> bool:
    usage = token_usage or {}
    with database.connect() as conn:
        cursor = conn.execute(
            """
            UPDATE analysis_jobs
            SET status = 'succeeded', final_state = %s, decision = %s,
                report_path = %s, tokens_used = %s, token_usage = %s,
                cost_usd = %s, cost_breakdown = %s, progress_percent = 100,
                current_step = 'Completed', finished_at = now(), updated_at = now(), error = NULL
            WHERE id = %s AND status = 'running'
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
    return cursor.rowcount == 1


def mark_failed(
    *,
    job_id: UUID | str,
    error: str,
    token_usage: dict | None,
    cost_breakdown: dict,
) -> bool:
    usage = token_usage or {}
    with database.connect() as conn:
        cursor = conn.execute(
            """
            UPDATE analysis_jobs
            SET status = 'failed', error = %s, tokens_used = %s,
                token_usage = %s, cost_usd = %s, cost_breakdown = %s,
                current_step = 'Failed', finished_at = now(), updated_at = now()
            WHERE id = %s AND status = 'running'
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
    return cursor.rowcount == 1


def total_tokens(token_usage: dict | None) -> int:
    if not token_usage:
        return 0
    return int(token_usage.get("total_tokens") or token_usage.get("total") or 0)
