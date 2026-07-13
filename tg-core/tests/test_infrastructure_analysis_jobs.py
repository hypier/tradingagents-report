from contextlib import contextmanager
from decimal import Decimal
from uuid import UUID

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
    assert params[:4] == (job_id, "AAPL", "2026-07-13", "stock")
    assert params[4].obj == ["fundamentals"]
    assert params[5].obj == {"research_depth": 1}
    assert params[6].obj == {"llm_provider": "openai"}


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
        rowcount = 2

        def fetchone(self):
            return {"acquired": True}

    class Connection:
        def execute(self, sql, _params=()):
            if "pg_try_advisory_lock" in sql:
                events.append("lock")
            elif "UPDATE analysis_jobs" in sql:
                events.append("update")
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
