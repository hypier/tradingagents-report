import asyncio

from fastapi.testclient import TestClient

from tradingagents.api import app as api_app


def test_lifespan_recovers_interrupted_jobs_and_enqueues_queued_jobs(monkeypatch):
    events = []

    class StubRunner:
        def start(self):
            events.append("start")

        def enqueue(self, job_id):
            events.append(("enqueue", job_id))

        def stop(self):
            events.append("stop")

    monkeypatch.setattr(api_app.db, "init_database", lambda: events.append("init"))
    monkeypatch.setattr(
        api_app.db,
        "recover_interrupted_jobs",
        lambda: events.append("recover"),
        raising=False,
    )
    monkeypatch.setattr(
        api_app.db,
        "list_queued_job_ids",
        lambda: ["job-1", "job-2"],
        raising=False,
    )
    monkeypatch.setattr(api_app, "job_runner", StubRunner(), raising=False)
    monkeypatch.setattr(
        api_app,
        "start_pricing_refresh",
        lambda: events.append("pricing"),
        raising=False,
    )

    async def run_lifespan():
        async with api_app.lifespan(api_app.app):
            events.append("ready")

    asyncio.run(run_lifespan())

    assert events == [
        "init",
        "recover",
        "start",
        ("enqueue", "job-1"),
        ("enqueue", "job-2"),
        "pricing",
        "ready",
        "stop",
    ]


def test_health_returns_503_when_database_is_unavailable(monkeypatch):
    def fail_healthcheck():
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(api_app.db, "healthcheck", fail_healthcheck)

    response = TestClient(api_app.app).get("/health")

    assert response.status_code == 503
    assert response.json()["status"] == "error"
