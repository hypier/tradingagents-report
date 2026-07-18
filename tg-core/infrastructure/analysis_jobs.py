from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime, timezone
from uuid import UUID

from psycopg.types.json import Jsonb

from infrastructure import database


class RequestIdConflictError(ValueError):
    """A client reused a request ID for a different analysis request."""


def insert_job(
    *,
    job_id: UUID,
    ticker: str,
    trade_date: str,
    asset_type: str,
    analysts: list[str],
    request: dict,
    config: dict,
    request_id: UUID | None = None,
) -> dict:
    with database.connect() as conn:
        row = conn.execute(
            """
            INSERT INTO analysis_jobs (
                id, ticker, trade_date, asset_type, analysts, status, request, config,
                progress_percent, current_step, events, tokens_used, token_usage, cost_usd, cost_breakdown,
                request_id
            )
            VALUES (%s, %s, %s, %s, %s, 'queued', %s, %s, 0, 'Queued', '[]'::jsonb, 0, '{}'::jsonb, 0, '{}'::jsonb, %s)
            ON CONFLICT (request_id) WHERE request_id IS NOT NULL DO NOTHING
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
                request_id,
            ),
        ).fetchone()
        if row is not None or request_id is None:
            return row

        existing = conn.execute(
            "SELECT * FROM analysis_jobs WHERE request_id = %s", (request_id,)
        ).fetchone()
    if existing is None:
        raise RuntimeError(f"request_id conflict without a persisted job: {request_id}")
    if existing.get("request") != request:
        raise RequestIdConflictError("request_id was already used for a different request")
    return existing


def get_job(job_id: UUID | str) -> dict | None:
    with database.connect() as conn:
        return conn.execute("SELECT * FROM analysis_jobs WHERE id = %s", (job_id,)).fetchone()


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


def list_queued_job_ids() -> list[UUID]:
    with database.connect() as conn:
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
    with database.connect() as conn:
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
        if cursor.rowcount == 1:
            _settle_credit_reservation(conn, job_id=job_id, outcome="consumed")
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
        if cursor.rowcount == 1:
            _settle_credit_reservation(conn, job_id=job_id, outcome="released")
    return cursor.rowcount == 1


def _settle_credit_reservation(conn, *, job_id: UUID | str, outcome: str) -> None:
    """Settle an optional product credit reservation with the job transition."""
    reason = "analysis_succeeded" if outcome == "consumed" else "analysis_failed"
    reservation = conn.execute(
        """
        UPDATE credit_reservations AS reservation
        SET status = %s, reason = %s, settled_at = now(), updated_at = now()
        FROM analysis_jobs AS job
        WHERE job.id = %s
          AND reservation.status = 'reserved'
          AND (
            reservation.analysis_job_id = job.id
            OR (
              reservation.analysis_job_id IS NULL
              AND reservation.request_id = job.request_id
            )
          )
        RETURNING reservation.clerk_user_id, reservation.request_id, reservation.units
        """,
        (outcome, reason, job_id),
    ).fetchone()
    if reservation is None:
        return

    units = int(reservation["units"])
    if outcome == "consumed":
        account = conn.execute(
            """
            UPDATE credit_accounts
            SET reserved_credits = reserved_credits - %s,
                spent_credits = spent_credits + %s,
                updated_at = now()
            WHERE clerk_user_id = %s AND reserved_credits >= %s
            RETURNING clerk_user_id
            """,
            (units, units, reservation["clerk_user_id"], units),
        ).fetchone()
        deltas = (0, -units, units)
        entry_type = "consume"
        description = "Analysis credit consumed"
    else:
        account = conn.execute(
            """
            UPDATE credit_accounts
            SET available_credits = available_credits + %s,
                reserved_credits = reserved_credits - %s,
                updated_at = now()
            WHERE clerk_user_id = %s AND reserved_credits >= %s
            RETURNING clerk_user_id
            """,
            (units, units, reservation["clerk_user_id"], units),
        ).fetchone()
        deltas = (units, -units, 0)
        entry_type = "release"
        description = "Analysis credit released"
    if account is None:
        raise RuntimeError(f"credit account is inconsistent for analysis job {job_id}")

    conn.execute(
        """
        INSERT INTO credit_ledger_entries (
            clerk_user_id, entry_type, available_delta, reserved_delta,
            spent_delta, idempotency_key, reference_type, reference_id,
            description, metadata
        ) VALUES (%s, %s, %s, %s, %s, %s, 'analysis_job', %s, %s, %s)
        ON CONFLICT (idempotency_key) DO NOTHING
        """,
        (
            reservation["clerk_user_id"],
            entry_type,
            *deltas,
            f"analysis:{reservation['request_id']}:{entry_type}",
            str(job_id),
            description,
            Jsonb({"reason": reason}),
        ),
    )


def total_tokens(token_usage: dict | None) -> int:
    if not token_usage:
        return 0
    return int(token_usage.get("total_tokens") or token_usage.get("total") or 0)


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
