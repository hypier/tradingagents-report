from datetime import datetime, timezone

from fastapi.testclient import TestClient

from api import app as api_app


def test_market_snapshot_returns_normalized_public_fields(monkeypatch):
    monkeypatch.setenv("TRADINGAGENTS_API_KEY", "server-secret")
    monkeypatch.setattr(
        "api.app.read_snapshot",
        lambda ticker: {
            "ticker": ticker,
            "display_name": "Apple Inc.",
            "last_price": 210.0,
            "currency": "USD",
            "change_percent": 1.2,
            "as_of": datetime(2026, 7, 15, tzinfo=timezone.utc),
            "source": "tradingview",
        },
    )

    response = TestClient(api_app.app).get(
        "/api/v1/market-snapshot?ticker=AAPL",
        headers={"Authorization": "Bearer server-secret"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "ticker": "AAPL",
        "display_name": "Apple Inc.",
        "last_price": 210.0,
        "currency": "USD",
        "change_percent": 1.2,
        "as_of": "2026-07-15T00:00:00Z",
        "source": "tradingview",
    }
