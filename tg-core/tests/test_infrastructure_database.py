from contextlib import contextmanager

import pytest

from infrastructure import database


class _Connection:
    def __init__(self):
        self.executed = []

    def execute(self, sql, params=()):
        self.executed.append((sql, params))
        return self

    def fetchone(self):
        sql = self.executed[-1][0]
        return {"n": 4 if "information_schema.columns" in sql else 4}


def test_database_url_uses_environment_override(monkeypatch):
    monkeypatch.setenv("TRADINGAGENTS_DATABASE_URL", "postgresql://example.test/tradingagents")

    assert database.database_url() == "postgresql://example.test/tradingagents"


def test_database_url_requires_environment_configuration(monkeypatch):
    monkeypatch.delenv("TRADINGAGENTS_DATABASE_URL", raising=False)

    with pytest.raises(RuntimeError, match="TRADINGAGENTS_DATABASE_URL"):
        database.database_url()


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


def test_require_schema_accepts_existing_tables(monkeypatch):
    connection = _Connection()

    @contextmanager
    def connect():
        yield connection

    monkeypatch.setattr(database, "connect", connect)

    database.require_schema()

    sql, params = connection.executed[0]
    assert "information_schema.tables" in sql
    assert params == ([
        "analysis_jobs",
        "llm_providers",
        "llm_models",
    ],)


def test_require_schema_fails_when_tables_are_missing(monkeypatch):
    class MissingConnection(_Connection):
        def fetchone(self):
            return {"n": 1}

    connection = MissingConnection()

    @contextmanager
    def connect():
        yield connection

    monkeypatch.setattr(database, "connect", connect)

    with pytest.raises(RuntimeError, match="pnpm db:migrate"):
        database.require_schema()


def test_require_schema_fails_when_credit_settlement_columns_are_missing(monkeypatch):
    class MissingColumnsConnection(_Connection):
        def fetchone(self):
            sql = self.executed[-1][0]
            return {"n": 3 if "information_schema.columns" in sql else 3}

    connection = MissingColumnsConnection()

    @contextmanager
    def connect():
        yield connection

    monkeypatch.setattr(database, "connect", connect)

    with pytest.raises(RuntimeError, match="pnpm db:migrate"):
        database.require_schema()


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
