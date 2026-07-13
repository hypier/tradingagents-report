from contextlib import contextmanager

from tradingagents.api import db


class _Connection:
    def execute(self, _sql, _params=()):
        return self

    def fetchall(self):
        return []


@contextmanager
def _connect():
    yield _Connection()


def test_mark_succeeded_prices_usage_with_job_provider(monkeypatch):
    providers = []

    def cost_for_usage(_usage, *, provider, **_kwargs):
        providers.append(provider)
        return {"total_cost_usd": 1.25}

    monkeypatch.setattr(db, "connect", _connect)
    monkeypatch.setattr(db, "cost_for_usage", cost_for_usage)

    db.mark_succeeded(
        job_id="00000000-0000-0000-0000-000000000001",
        final_state={},
        decision="Hold",
        report_path=None,
        token_usage={"total_tokens": 10},
        provider="anthropic",
    )

    assert providers == ["anthropic"]


def test_init_database_does_not_refresh_external_prices(monkeypatch):
    monkeypatch.setattr(db, "connect", _connect)
    monkeypatch.setattr(db, "seed_fallback_model_prices", lambda _conn: None)
    monkeypatch.setattr(
        db,
        "refresh_model_prices_if_stale",
        lambda _conn: raise_unexpected("external price refresh"),
    )
    monkeypatch.setattr(
        db,
        "backfill_analysis_costs",
        lambda _conn: raise_unexpected("cost backfill"),
    )

    db.init_database()


def test_cost_lookup_uses_cached_prices_without_network_refresh(monkeypatch):
    monkeypatch.setattr(db, "connect", _connect)
    monkeypatch.setattr(
        db,
        "refresh_model_prices_if_stale",
        lambda: raise_unexpected("external price refresh"),
    )

    assert db.get_model_prices(provider="openai") == []


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

    monkeypatch.setattr(db, "connect", connect)

    assert db.recover_interrupted_jobs() == 2
    assert events == ["lock", "update", "commit", "unlock"]


def test_analysis_execution_lock_uses_autocommit_connection(monkeypatch):
    events = []

    class Connection:
        def execute(self, sql, _params=()):
            events.append("unlock" if "unlock" in sql else "lock")

    @contextmanager
    def connect(*, autocommit=False):
        events.append(("autocommit", autocommit))
        yield Connection()

    monkeypatch.setattr(db, "connect", connect)

    with db.analysis_execution_lock():
        events.append("run")

    assert events == [("autocommit", True), "lock", "run", "unlock"]


def raise_unexpected(name):
    raise AssertionError(f"synchronous database path must not run {name}")
