import asyncio
from uuid import UUID

from fastapi.testclient import TestClient

from api import app as api_app


def test_lifespan_recovers_interrupted_jobs_and_enqueues_queued_jobs(monkeypatch):
    events = []

    class StubWorker:
        def start(self):
            events.append("start")

        def enqueue(self, job_id):
            events.append(("enqueue", job_id))

        def stop(self):
            events.append("stop")

    monkeypatch.setattr(api_app.database, "require_schema", lambda: events.append("schema"))
    monkeypatch.setattr(
        api_app.llm_prices,
        "seed_fallback_model_prices",
        lambda: events.append("seed"),
    )
    monkeypatch.setattr(
        api_app.analysis_jobs,
        "recover_interrupted_jobs",
        lambda: events.append("recover"),
        raising=False,
    )
    monkeypatch.setattr(
        api_app.analysis_jobs,
        "list_queued_job_ids",
        lambda: ["job-1", "job-2"],
        raising=False,
    )
    monkeypatch.setattr(api_app, "job_worker", StubWorker(), raising=False)
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
        "schema",
        "seed",
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

    monkeypatch.setattr(api_app.database, "healthcheck", fail_healthcheck)

    response = TestClient(api_app.app).get("/health")

    assert response.status_code == 503
    assert response.json()["status"] == "error"


def test_get_analysis_events_returns_only_persisted_timeline(monkeypatch):
    job_id = UUID("00000000-0000-0000-0000-000000000001")
    monkeypatch.setattr(
        api_app.analysis_jobs,
        "get_job",
        lambda _job_id: {
            "events": [
                {
                    "time": "2026-01-15T00:00:00+00:00",
                    "progress_percent": 10,
                    "message": "Market Analyst: calling get_stock_data",
                    "kind": "tool_call",
                }
            ],
            "final_state": {"market_report": "must not be returned"},
        },
    )

    events = api_app.get_analysis_events(job_id)

    assert events == [
        {
            "time": "2026-01-15T00:00:00+00:00",
            "progress_percent": 10,
            "message": "Market Analyst: calling get_stock_data",
            "kind": "tool_call",
        }
    ]
