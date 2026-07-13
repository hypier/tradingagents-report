from fastapi.testclient import TestClient

from tradingagents.api import app as api_app


def test_submit_analysis_requires_api_key(monkeypatch):
    monkeypatch.setenv("TRADINGAGENTS_API_KEY", "server-secret")

    response = TestClient(api_app.app).post(
        "/api/v1/analyses",
        json={"ticker": "NVDA", "trade_date": "2026-01-15", "analysts": ["market"]},
    )

    assert response.status_code == 401


def test_openapi_documents_api_key_header():
    schema = api_app.app.openapi()

    assert "X-API-Key: <TRADINGAGENTS_API_KEY>" in schema["info"]["description"]
    assert schema["components"]["securitySchemes"]["APIKeyHeader"] == {
        "type": "apiKey",
        "in": "header",
        "name": "X-API-Key",
    }
