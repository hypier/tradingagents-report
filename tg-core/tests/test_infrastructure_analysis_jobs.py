from contextlib import contextmanager
from decimal import Decimal
from uuid import UUID

import pytest

from infrastructure import analysis_jobs


def test_insert_job_persists_queued_defaults_and_returns_row(monkeypatch):
    executed = []
    row = {"id": "job-id", "status": "queued"}

    class Cursor:
        def fetchone(self):
            return row

    class Connection:
        def execute(self, sql, params=()):
            executed.append((sql, params))
            return Cursor()

    @contextmanager
    def connect():
        yield Connection()

    monkeypatch.setattr(analysis_jobs.database, "connect", connect)

    job_id = UUID("00000000-0000-0000-0000-000000000001")
    result = analysis_jobs.insert_job(
        job_id=job_id,
        ticker="AAPL",
        trade_date="2026-07-13",
        asset_type="stock",
        analysts=["fundamentals"],
        request={"research_depth": 1},
        config={"llm_provider": "openai"},
    )

    sql, params = executed[0]
    assert result is row
    assert "'queued'" in sql
    assert "'Queued'" in sql
    assert "RETURNING *" in sql
    assert params[:5] == (job_id, "AAPL", None, "2026-07-13", "stock")
    assert params[5].obj == ["fundamentals"]
    assert params[6].obj == {"research_depth": 1}
    assert params[7].obj == {"llm_provider": "openai"}
    assert params[8].obj == {}


def test_insert_job_returns_existing_job_for_matching_request_id(monkeypatch):
    executed = []
    existing = {"id": "existing-job", "request": {"ticker": "0700.HK"}}

    class Cursor:
        def __init__(self, row):
            self.row = row

        def fetchone(self):
            return self.row

    class Connection:
        def execute(self, sql, params=()):
            executed.append((sql, params))
            return Cursor(None if "INSERT" in sql else existing)

    @contextmanager
    def connect():
        yield Connection()

    monkeypatch.setattr(analysis_jobs.database, "connect", connect)

    result = analysis_jobs.insert_job(
        job_id=UUID("00000000-0000-0000-0000-000000000001"),
        request_id=UUID("00000000-0000-0000-0000-000000000010"),
        ticker="0700.HK",
        trade_date="2026-07-13",
        asset_type="stock",
        analysts=["market"],
        request={"ticker": "0700.HK"},
        config={},
    )

    assert result is existing
    assert "ON CONFLICT (request_id)" in executed[0][0]


def test_insert_job_rejects_different_request_for_reused_request_id(monkeypatch):
    existing = {"id": "existing-job", "request": {"ticker": "0700.HK"}}

    class Cursor:
        def __init__(self, row):
            self.row = row

        def fetchone(self):
            return self.row

    class Connection:
        def execute(self, sql, _params=()):
            return Cursor(None if "INSERT" in sql else existing)

    @contextmanager
    def connect():
        yield Connection()

    monkeypatch.setattr(analysis_jobs.database, "connect", connect)

    with pytest.raises(analysis_jobs.RequestIdConflictError):
        analysis_jobs.insert_job(
            job_id=UUID("00000000-0000-0000-0000-000000000001"),
            request_id=UUID("00000000-0000-0000-0000-000000000010"),
            ticker="AAPL",
            trade_date="2026-07-13",
            asset_type="stock",
            analysts=["market"],
            request={"ticker": "AAPL"},
            config={},
        )


def test_get_job_returns_database_row(monkeypatch):
    row = {"id": "job-id"}
    executed = []

    class Cursor:
        def fetchone(self):
            return row

    class Connection:
        def execute(self, sql, params=()):
            executed.append((sql, params))
            return Cursor()

    @contextmanager
    def connect():
        yield Connection()

    monkeypatch.setattr(analysis_jobs.database, "connect", connect)

    assert analysis_jobs.get_job("job-id") is row
    assert executed == [("SELECT * FROM analysis_jobs WHERE id = %s", ("job-id",))]


def test_list_queued_job_ids_returns_ids_in_created_order(monkeypatch):
    first = UUID("00000000-0000-0000-0000-000000000001")
    second = UUID("00000000-0000-0000-0000-000000000002")
    executed = []

    class Cursor:
        def fetchall(self):
            return [{"id": first}, {"id": second}]

    class Connection:
        def execute(self, sql, params=()):
            executed.append((sql, params))
            return Cursor()

    @contextmanager
    def connect():
        yield Connection()

    monkeypatch.setattr(analysis_jobs.database, "connect", connect)

    assert analysis_jobs.list_queued_job_ids() == [first, second]
    assert executed == [
        ("SELECT id FROM analysis_jobs WHERE status = 'queued' ORDER BY created_at", ())
    ]


def test_list_jobs_applies_optional_filters_and_pagination(monkeypatch):
    executed = []
    rows = [{"id": "job-id"}]

    class Cursor:
        def fetchall(self):
            return rows

    class Connection:
        def execute(self, sql, params=()):
            executed.append((sql, params))
            return Cursor()

    @contextmanager
    def connect():
        yield Connection()

    monkeypatch.setattr(analysis_jobs.database, "connect", connect)

    assert analysis_jobs.list_jobs(ticker="AAPL", status="queued", limit=10, offset=20) == rows
    sql, params = executed[0]
    assert "ticker = %s" in sql
    assert "status = %s" in sql
    assert params == ("AAPL", "AAPL", "queued", "queued", 10, 20)


def test_row_to_public_converts_database_json_and_number_values():
    row = {
        "analysts": ("fundamentals",),
        "events": ({"message": "Queued"},),
        "token_usage": {"total_tokens": 10},
        "tokens_used": "10",
        "cost_usd": Decimal("0.25"),
        "cost_breakdown": {"total_cost_usd": 0.25},
    }

    public = analysis_jobs.row_to_public(row)

    assert public == {
        "analysts": ["fundamentals"],
        "events": [{"message": "Queued"}],
        "token_usage": {"total_tokens": 10},
        "tokens_used": 10,
        "cost_usd": 0.25,
        "cost_breakdown": {"total_cost_usd": 0.25},
        "display": {},
        "output_language": None,
    }
    assert row["analysts"] == ("fundamentals",)


def test_rows_to_public_converts_each_row():
    assert analysis_jobs.rows_to_public([{"tokens_used": None, "cost_usd": None}]) == [
        {
            "analysts": [],
            "events": [],
            "token_usage": {},
            "tokens_used": 0,
            "cost_usd": 0.0,
            "cost_breakdown": {},
            "display": {},
            "output_language": None,
        }
    ]


def test_claim_job_only_claims_queued_job(monkeypatch):
    executed = []

    class Cursor:
        def fetchone(self):
            return {"id": "job-id", "status": "running"}

    class Connection:
        def execute(self, sql, params=()):
            executed.append((sql, params))
            return Cursor()

    @contextmanager
    def connect():
        yield Connection()

    monkeypatch.setattr(analysis_jobs.database, "connect", connect)

    assert analysis_jobs.claim_job("job-id") == {"id": "job-id", "status": "running"}
    assert "WHERE id = %s AND status = 'queued'" in executed[0][0]


def test_recover_interrupted_jobs_commits_before_unlock(monkeypatch):
    events = []

    class Cursor:
        def __init__(self, row=None, rows=None):
            self.row = row
            self.rows = rows or []
            self.rowcount = len(self.rows)

        def fetchone(self):
            return self.row

        def fetchall(self):
            return self.rows

    class Connection:
        def execute(self, sql, _params=()):
            if "pg_try_advisory_lock" in sql:
                events.append("lock")
                return Cursor(row={"acquired": True})
            elif "UPDATE analysis_jobs" in sql:
                events.append("update")
                return Cursor(rows=[
                    {"id": "job-1", "cost_usd": Decimal("0.25")},
                    {"id": "job-2", "cost_usd": Decimal("0")},
                ])
            elif "pg_advisory_unlock" in sql:
                events.append("unlock")
            return Cursor()

        def commit(self):
            events.append("commit")

    @contextmanager
    def connect():
        yield Connection()

    monkeypatch.setattr(analysis_jobs.database, "connect", connect)

    assert analysis_jobs.recover_interrupted_jobs() == 2
    assert events == ["lock", "update", "commit", "unlock"]


def test_update_progress_clamps_progress_and_appends_event(monkeypatch):
    executed = []

    class Connection:
        def execute(self, sql, params=()):
            executed.append((sql, params))

    @contextmanager
    def connect():
        yield Connection()

    monkeypatch.setattr(analysis_jobs.database, "connect", connect)

    analysis_jobs.update_progress(job_id="job-id", progress_percent=125, current_step="Reviewing")

    sql, params = executed[0]
    assert "GREATEST(progress_percent, %s)" in sql
    assert params[0] == 99
    assert params[1] == "Reviewing"


def test_mark_succeeded_only_updates_running_job(monkeypatch):
    executed = []

    class Cursor:
        rowcount = 1

        def fetchone(self):
            return None

    class Connection:
        def execute(self, sql, params=()):
            executed.append((sql, params))
            return Cursor()

    @contextmanager
    def connect():
        yield Connection()

    monkeypatch.setattr(analysis_jobs.database, "connect", connect)

    updated = analysis_jobs.mark_succeeded(
        job_id="00000000-0000-0000-0000-000000000001",
        final_state={},
        decision="Hold",
        report_path=None,
        token_usage={"total_tokens": 10},
        cost_breakdown={"total_cost_usd": 0.25},
    )

    assert updated is True
    assert "WHERE id = %s AND status = 'running'" in executed[0][0]


def test_mark_succeeded_returns_false_when_job_is_already_terminal(monkeypatch):
    class Cursor:
        rowcount = 0

    class Connection:
        def execute(self, _sql, _params=()):
            return Cursor()

    @contextmanager
    def connect():
        yield Connection()

    monkeypatch.setattr(analysis_jobs.database, "connect", connect)

    assert (
        analysis_jobs.mark_succeeded(
            job_id="job-id",
            final_state={},
            decision="Hold",
            report_path=None,
            token_usage=None,
            cost_breakdown={"total_cost_usd": 0},
        )
        is False
    )


def test_mark_failed_only_updates_running_job_and_returns_bool(monkeypatch):
    executed = []

    class Cursor:
        rowcount = 1

        def fetchone(self):
            return None

    class Connection:
        def execute(self, sql, params=()):
            executed.append((sql, params))
            return Cursor()

    @contextmanager
    def connect():
        yield Connection()

    monkeypatch.setattr(analysis_jobs.database, "connect", connect)

    updated = analysis_jobs.mark_failed(
        job_id="job-id",
        error="failed",
        token_usage={"total": 11},
        cost_breakdown={"total_cost_usd": 0.1},
    )

    assert updated is True
    assert "WHERE id = %s AND status = 'running'" in executed[0][0]
    assert executed[0][1][1] == 11


def test_mark_failed_returns_false_when_job_is_already_terminal(monkeypatch):
    class Cursor:
        rowcount = 0

    class Connection:
        def execute(self, _sql, _params=()):
            return Cursor()

    @contextmanager
    def connect():
        yield Connection()

    monkeypatch.setattr(analysis_jobs.database, "connect", connect)

    assert (
        analysis_jobs.mark_failed(
            job_id="job-id",
            error="failed",
            token_usage=None,
            cost_breakdown={"total_cost_usd": 0},
        )
        is False
    )


def test_cancel_job_appends_stop_requested_event_for_running_job(monkeypatch):
    executed = []

    class Cursor:
        def __init__(self, rowcount):
            self.rowcount = rowcount

    class Connection:
        def execute(self, sql, params=()):
            executed.append((sql, params))
            if "status = 'queued'" in sql:
                return Cursor(0)
            return Cursor(1)

    @contextmanager
    def connect():
        yield Connection()

    monkeypatch.setattr(analysis_jobs.database, "connect", connect)

    assert analysis_jobs.cancel_job("job-id") == "cancel_requested"
    running_sql, running_params = executed[1]
    event_payload = running_params[0].obj
    assert event_payload[0]["message"] == "Stop requested"
    assert "current_step = CASE" in running_sql
    assert running_params[1] == "job-id"


def test_cancel_job_appends_cancelled_event_for_queued_job(monkeypatch):
    executed = []

    class Cursor:
        rowcount = 1

        def fetchone(self):
            return None

    class Connection:
        def execute(self, sql, params=()):
            executed.append((sql, params))
            return Cursor()

    @contextmanager
    def connect():
        yield Connection()

    monkeypatch.setattr(analysis_jobs.database, "connect", connect)
    monkeypatch.setattr(
        analysis_jobs,
        "_settle_analysis_credits",
        lambda *_args, **_kwargs: None,
    )

    assert analysis_jobs.cancel_job("job-id") == "cancelled"
    queued_sql, queued_params = executed[0]
    event_payload = queued_params[0].obj
    assert event_payload[0]["message"] == "Cancelled"
    assert "status = 'queued'" in queued_sql


class _SettlementCursor:
    def __init__(self, row=None):
        self.row = row

    def fetchone(self):
        return self.row


class _SettlementConnection:
    def __init__(self, job, *, ledger_inserted=True):
        self.job = job
        self.ledger_inserted = ledger_inserted
        self.executed = []

    def execute(self, sql, params=()):
        self.executed.append((sql, params))
        if "FROM analysis_jobs" in sql and "SELECT" in sql and "FOR UPDATE" in sql:
            return _SettlementCursor(self.job)
        if "INSERT INTO credit_ledger_entries" in sql:
            return _SettlementCursor({"id": "entry-1"} if self.ledger_inserted else None)
        if "UPDATE credit_accounts" in sql:
            return _SettlementCursor({"clerk_user_id": "user-1"})
        return _SettlementCursor()


def _product_job(*, pricing_snapshot=True):
    return {
        "id": UUID("00000000-0000-4000-8000-000000000011"),
        "clerk_user_id": "user-1",
        "request_id": UUID("00000000-0000-4000-8000-000000000010"),
        "credit_pricing": (
            {
                "points_per_usd": "100.000000",
                "markup_basis_points": 1000,
                "analysis_balance_threshold": 0,
            }
            if pricing_snapshot
            else None
        ),
    }


@pytest.mark.parametrize(
    ("actual_cost_usd", "settled_units"),
    [
        (Decimal("0"), 0),
        (Decimal("0.123"), 14),
        (Decimal("2.00"), 220),
    ],
)
def test_settle_analysis_credits_uses_actual_cost(actual_cost_usd, settled_units):
    connection = _SettlementConnection(_product_job())

    analysis_jobs._settle_analysis_credits(
        connection,
        job_id=UUID("00000000-0000-4000-8000-000000000011"),
        billable=True,
        actual_cost_usd=actual_cost_usd,
        reason="analysis_succeeded",
    )

    if settled_units == 0:
        assert not any("UPDATE credit_accounts" in sql for sql, _ in connection.executed)
        return

    account_sql, account_params = next(
        item for item in connection.executed if "UPDATE credit_accounts" in item[0]
    )
    assert "period_credits = period_credits - LEAST(period_credits, %s)" in account_sql
    assert "bonus_credits = bonus_credits - (%s - LEAST(period_credits, %s))" in account_sql
    assert account_params == (
        settled_units,
        settled_units,
        settled_units,
        settled_units,
        settled_units,
        settled_units,
        settled_units,
        "user-1",
    )
    ledger_params = next(
        params
        for sql, params in connection.executed
        if "INSERT INTO credit_ledger_entries" in sql
    )
    assert ledger_params[0] == "user-1"
    assert ledger_params[1:3] == (-settled_units, settled_units)
    assert ledger_params[3] == "analysis:00000000-0000-4000-8000-000000000011:consume"
    assert ledger_params[-1].obj["actualCostUsd"] == str(actual_cost_usd)
    assert ledger_params[-1].obj["finalPoints"] == settled_units


def test_settle_analysis_credits_skips_when_not_billable():
    connection = _SettlementConnection(_product_job())

    analysis_jobs._settle_analysis_credits(
        connection,
        job_id="job-id",
        billable=False,
        actual_cost_usd=Decimal("0.50"),
        reason="analysis_failed",
    )

    assert connection.executed == []


def test_settle_analysis_credits_skips_without_pricing():
    connection = _SettlementConnection(_product_job(pricing_snapshot=False))

    analysis_jobs._settle_analysis_credits(
        connection,
        job_id="job-id",
        billable=True,
        actual_cost_usd=Decimal("0.123"),
        reason="analysis_succeeded",
    )

    assert len(connection.executed) == 1
    assert not any("UPDATE credit_accounts" in sql for sql, _ in connection.executed)


def test_settle_analysis_credits_is_idempotent_when_ledger_exists():
    connection = _SettlementConnection(_product_job(), ledger_inserted=False)

    analysis_jobs._settle_analysis_credits(
        connection,
        job_id=UUID("00000000-0000-4000-8000-000000000011"),
        billable=True,
        actual_cost_usd=Decimal("1"),
        reason="analysis_succeeded",
    )

    assert not any("UPDATE credit_accounts" in sql for sql, _ in connection.executed)
