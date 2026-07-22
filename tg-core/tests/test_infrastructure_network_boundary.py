import importlib
import urllib.request
from contextlib import contextmanager

from infrastructure import analysis_jobs, database, llm_prices


def test_infrastructure_imports_and_sql_calls_do_not_use_http_clients(monkeypatch):
    http_calls = []

    def fail_http(*args, **kwargs):
        http_calls.append((args, kwargs))
        raise AssertionError("infrastructure SQL paths must not make HTTP requests")

    monkeypatch.setattr(urllib.request, "urlopen", fail_http)
    importlib.reload(database)
    importlib.reload(analysis_jobs)
    importlib.reload(llm_prices)

    executed = []

    class Cursor:
        def __init__(self, sql):
            self.sql = sql

        def fetchone(self):
            if "information_schema.tables" in self.sql:
                return {"n": 3}
            if "information_schema.columns" in self.sql:
                return {"n": 4}
            return {"id": "job-id"}

        def fetchall(self):
            return [{"provider": "openai", "model": "test-model"}]

    class Connection:
        def execute(self, sql, params=()):
            executed.append((sql, params))
            return Cursor(sql)

    @contextmanager
    def connect(*, autocommit=False):
        assert autocommit is False
        yield Connection()

    monkeypatch.setattr(database, "connect", connect)

    database.require_schema()
    assert analysis_jobs.get_job("job-id") == {"id": "job-id"}
    assert llm_prices.get_model_prices(provider="openai") == [
        {"provider": "openai", "model": "test-model"}
    ]

    assert http_calls == []
    assert any("information_schema.tables" in sql for sql, _ in executed)
    assert ("SELECT * FROM analysis_jobs WHERE id = %s", ("job-id",)) in executed
    assert any("FROM llm_models" in sql for sql, _ in executed)
