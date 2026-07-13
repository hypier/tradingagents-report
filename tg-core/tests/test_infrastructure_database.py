from contextlib import contextmanager

from infrastructure import database


class _Connection:
    def __init__(self):
        self.executed = []

    def execute(self, sql, params=()):
        self.executed.append((sql, params))


def test_database_url_uses_environment_override(monkeypatch):
    monkeypatch.setenv("TRADINGAGENTS_DATABASE_URL", "postgresql://example.test/tradingagents")

    assert database.database_url() == "postgresql://example.test/tradingagents"


def test_connect_uses_configured_url_dict_rows_and_autocommit(monkeypatch):
    calls = []

    def psycopg_connect(*args, **kwargs):
        calls.append((args, kwargs))
        return object()

    monkeypatch.setattr(database.psycopg, "connect", psycopg_connect)
    monkeypatch.setattr(database, "database_url", lambda: "postgresql://example.test/tradingagents")

    database.connect(autocommit=True)

    assert calls == [
        (
            ("postgresql://example.test/tradingagents",),
            {"autocommit": True, "row_factory": database.dict_row},
        )
    ]


def test_init_database_creates_idempotent_schema_without_price_refresh_or_backfill(monkeypatch):
    connection = _Connection()

    @contextmanager
    def connect():
        yield connection

    monkeypatch.setattr(database, "connect", connect)

    database.init_database()

    statements = "\n".join(sql for sql, _params in connection.executed)
    assert "CREATE TABLE IF NOT EXISTS analysis_jobs" in statements
    assert "CREATE TABLE IF NOT EXISTS llm_model_prices" in statements
    assert "CREATE TABLE IF NOT EXISTS llm_pricing_sources" in statements
    assert "CREATE INDEX IF NOT EXISTS analysis_jobs_ticker_created_idx" in statements
    assert "http" not in statements.lower()


def test_healthcheck_executes_select_one(monkeypatch):
    connection = _Connection()

    @contextmanager
    def connect():
        yield connection

    monkeypatch.setattr(database, "connect", connect)

    database.healthcheck()

    assert connection.executed == [("SELECT 1", ())]


def test_analysis_execution_lock_uses_autocommit_connection(monkeypatch):
    events = []

    class Connection:
        def execute(self, sql, _params=()):
            events.append("unlock" if "unlock" in sql else "lock")

    @contextmanager
    def connect(*, autocommit=False):
        events.append(("autocommit", autocommit))
        yield Connection()

    monkeypatch.setattr(database, "connect", connect)

    with database.analysis_execution_lock():
        events.append("run")

    assert events == [("autocommit", True), "lock", "run", "unlock"]
