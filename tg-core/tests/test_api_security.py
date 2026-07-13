from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from api import app as api_app
from api.security import require_api_key


def test_submit_analysis_requires_api_key(monkeypatch):
    monkeypatch.setenv("TRADINGAGENTS_API_KEY", "server-secret")

    response = TestClient(api_app.app).post(
        "/api/v1/analyses",
        json={"ticker": "NVDA", "trade_date": "2026-01-15", "analysts": ["market"]},
    )

    assert response.status_code == 401


def test_bearer_token_authenticates_protected_endpoint(monkeypatch):
    monkeypatch.setenv("TRADINGAGENTS_API_KEY", "server-secret")
    app = FastAPI()

    @app.get("/protected", dependencies=[Depends(require_api_key)])
    def protected() -> dict[str, bool]:
        return {"ok": True}

    response = TestClient(app).get(
        "/protected",
        headers={"Authorization": "Bearer server-secret"},
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_x_api_key_header_is_not_accepted_as_bearer_token(monkeypatch):
    monkeypatch.setenv("TRADINGAGENTS_API_KEY", "server-secret")
    app = FastAPI()

    @app.get("/protected", dependencies=[Depends(require_api_key)])
    def protected() -> dict[str, bool]:
        return {"ok": True}

    response = TestClient(app).get(
        "/protected",
        headers={"X-API-Key": "server-secret"},
    )

    assert response.status_code == 401
