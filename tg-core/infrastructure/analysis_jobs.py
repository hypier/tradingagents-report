from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime, timezone
from decimal import ROUND_CEILING, Decimal
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
    exchange: str | None = None,
    display: dict | None = None,
    clerk_user_id: str | None = None,
    credit_pricing: dict | None = None,
) -> dict:
    with database.connect() as conn:
        row = conn.execute(
            """
            INSERT INTO analysis_jobs (
                id, ticker, exchange, trade_date, asset_type, analysts, status, request, config,
                display, progress_percent, current_step, events, tokens_used, token_usage, cost_usd,
                cost_breakdown, request_id, clerk_user_id, credit_pricing
            )
            VALUES (
                %s, %s, %s, %s, %s, %s, 'queued', %s, %s, %s, 0, 'Queued', '[]'::jsonb, 0,
                '{}'::jsonb, 0, '{}'::jsonb, %s, %s, %s
            )
            ON CONFLICT (request_id) WHERE request_id IS NOT NULL DO NOTHING
            RETURNING *
            """,
            (
                job_id,
                ticker,
                exchange,
                trade_date,
                asset_type,
                Jsonb(analysts),
                Jsonb(request),
                Jsonb(config),
                Jsonb(display or {}),
                request_id,
                clerk_user_id,
                Jsonb(credit_pricing) if credit_pricing is not None else None,
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
                RETURNING id, cost_usd
                """
            )
            interrupted_jobs = cursor.fetchall()
            for job in interrupted_jobs:
                _settle_analysis_credits(
                    conn,
                    job_id=job["id"],
                    billable=False,
                    actual_cost_usd=Decimal(str(job.get("cost_usd") or 0)),
                    reason="analysis_interrupted",
                )
            conn.commit()
            return len(interrupted_jobs)
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
            _settle_analysis_credits(
                conn,
                job_id=job_id,
                billable=True,
                actual_cost_usd=Decimal(str(cost_breakdown["total_cost_usd"])),
                reason="analysis_succeeded",
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
    user_cancelled = error.startswith("Cancelled")
    current_step = "Cancelled" if user_cancelled else "Failed"
    terminal_event = _timeline_event(
        progress_percent=None,
        message=current_step,
        kind="stage",
    )
    with database.connect() as conn:
        cursor = conn.execute(
            """
            UPDATE analysis_jobs
            SET status = 'failed', error = %s, tokens_used = %s,
                token_usage = %s, cost_usd = %s, cost_breakdown = %s,
                current_step = %s,
                events = COALESCE(events, '[]'::jsonb) || %s::jsonb,
                finished_at = now(), updated_at = now()
            WHERE id = %s AND status = 'running'
            """,
            (
                error,
                total_tokens(usage),
                Jsonb(usage),
                cost_breakdown["total_cost_usd"],
                Jsonb(cost_breakdown),
                current_step,
                Jsonb([terminal_event]),
                job_id,
            ),
        )
        if cursor.rowcount == 1:
            _settle_analysis_credits(
                conn,
                job_id=job_id,
                billable=user_cancelled,
                actual_cost_usd=Decimal(str(cost_breakdown["total_cost_usd"])),
                reason=(
                    "analysis_cancelled_by_user"
                    if user_cancelled
                    else "analysis_failed"
                ),
            )
    return cursor.rowcount == 1


def cancel_job(job_id: UUID | str) -> str | None:
    """Cancel a queued job immediately, or request cancel for a running job.

    Returns ``cancelled``, ``cancel_requested``, or ``None`` when the job is
    already terminal / missing.
    """
    cancelled_event = _timeline_event(
        progress_percent=None,
        message="Cancelled",
        kind="stage",
    )
    stop_requested_event = _timeline_event(
        progress_percent=None,
        message="Stop requested",
        kind="stage",
    )
    with database.connect() as conn:
        cursor = conn.execute(
            """
            UPDATE analysis_jobs
            SET status = 'failed',
                error = 'Cancelled by user',
                current_step = 'Cancelled',
                events = COALESCE(events, '[]'::jsonb) || %s::jsonb,
                finished_at = now(),
                updated_at = now()
            WHERE id = %s AND status = 'queued'
            """,
            (Jsonb([cancelled_event]), job_id),
        )
        if cursor.rowcount == 1:
            _settle_analysis_credits(
                conn,
                job_id=job_id,
                billable=True,
                actual_cost_usd=Decimal("0"),
                reason="analysis_cancelled_by_user",
            )
            return "cancelled"

        cursor = conn.execute(
            """
            UPDATE analysis_jobs
            SET request = jsonb_set(
                    COALESCE(request, '{}'::jsonb),
                    '{cancel_requested}',
                    'true'::jsonb,
                    true
                ),
                current_step = CASE
                    WHEN COALESCE(request->>'cancel_requested', 'false') = 'true'
                        THEN current_step
                    ELSE 'Stopping'
                END,
                events = CASE
                    WHEN COALESCE(request->>'cancel_requested', 'false') = 'true'
                        THEN COALESCE(events, '[]'::jsonb)
                    ELSE COALESCE(events, '[]'::jsonb) || %s::jsonb
                END,
                updated_at = now()
            WHERE id = %s AND status = 'running'
            """,
            (Jsonb([stop_requested_event]), job_id),
        )
        if cursor.rowcount == 1:
            return "cancel_requested"
    return None


def _timeline_event(
    *,
    message: str,
    kind: str,
    progress_percent: int | None = None,
) -> dict:
    event: dict = {
        "time": datetime.now(timezone.utc).isoformat(),
        "message": message,
        "kind": kind,
    }
    if progress_percent is not None:
        event["progress_percent"] = progress_percent
    return event


def is_cancel_requested(job_id: UUID | str) -> bool:
    row = get_job(job_id)
    if row is None:
        return False
    request = row.get("request") or {}
    return bool(request.get("cancel_requested"))


def _settle_analysis_credits(
    conn,
    *,
    job_id: UUID | str,
    billable: bool,
    actual_cost_usd: Decimal,
    reason: str,
) -> None:
    """Charge product credits for billable terminal states; no-op otherwise."""
    if not billable:
        return

    job = conn.execute(
        """
        SELECT id, clerk_user_id, credit_pricing, request_id
        FROM analysis_jobs
        WHERE id = %s
        FOR UPDATE
        """,
        (job_id,),
    ).fetchone()
    if job is None:
        return

    clerk_user_id = job.get("clerk_user_id")
    pricing_snapshot = job.get("credit_pricing")
    if not clerk_user_id or not pricing_snapshot:
        return

    settled_units = _calculate_actual_credit_units(actual_cost_usd, pricing_snapshot)
    if settled_units <= 0:
        return

    idempotency_key = f"analysis:{job_id}:consume"
    entry = conn.execute(
        """
        INSERT INTO credit_ledger_entries (
            clerk_user_id, entry_type, available_delta, reserved_delta,
            spent_delta, idempotency_key, reference_type, reference_id,
            description, metadata
        ) VALUES (%s, 'consume', %s, 0, %s, %s, 'analysis_job', %s, %s, %s)
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id
        """,
        (
            clerk_user_id,
            -settled_units,
            settled_units,
            idempotency_key,
            str(job_id),
            "Analysis credit consumed",
            Jsonb(
                {
                    "reason": reason,
                    "actualCostUsd": str(actual_cost_usd),
                    "finalPoints": settled_units,
                    "pointsPerUsd": pricing_snapshot.get("points_per_usd"),
                    "markupBasisPoints": pricing_snapshot.get(
                        "markup_basis_points"
                    ),
                    "requestId": (
                        str(job["request_id"]) if job.get("request_id") else None
                    ),
                }
            ),
        ),
    ).fetchone()
    if entry is None:
        return

    account = conn.execute(
        """
        UPDATE credit_accounts
        SET available_credits = available_credits - %s,
            spent_credits = spent_credits + %s,
            updated_at = now()
        WHERE clerk_user_id = %s
        RETURNING clerk_user_id
        """,
        (settled_units, settled_units, clerk_user_id),
    ).fetchone()
    if account is None:
        raise RuntimeError(f"credit account is missing for analysis job {job_id}")


def _calculate_actual_credit_units(actual_cost_usd: Decimal, pricing: dict) -> int:
    if actual_cost_usd <= 0:
        return 0
    points_per_usd = Decimal(str(pricing["points_per_usd"]))
    markup = Decimal(int(pricing["markup_basis_points"])) / Decimal(10_000)
    units = (actual_cost_usd * (Decimal(1) + markup) * points_per_usd).to_integral_value(
        rounding=ROUND_CEILING
    )
    return max(1, int(units))


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
    public["display"] = dict(public.get("display") or {})
    request = public.get("request") or {}
    config = public.get("config") or {}
    public["output_language"] = (
        request.get("output_language")
        if isinstance(request, dict)
        else None
    ) or (config.get("output_language") if isinstance(config, dict) else None)
    return public
