from contextlib import contextmanager

from infrastructure import analysis_jobs


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
