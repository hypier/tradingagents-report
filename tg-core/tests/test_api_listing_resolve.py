import pytest
from fastapi import HTTPException

from api.app import resolve_listing_endpoint


def test_resolve_listing_endpoint_returns_provider_and_display_tickers():
    result = resolve_listing_endpoint(ticker="300750.SZ")

    assert result.model_dump() == {
        "ticker": "300750.SZ",
        "exchange": "SZSE",
        "symbol": "300750",
        "display_ticker": "300750.SZ",
        "provider_symbol": "SZSE:300750",
    }


def test_resolve_listing_endpoint_rejects_invalid_ticker():
    with pytest.raises(HTTPException) as exc:
        resolve_listing_endpoint(ticker="../AAPL")

    assert exc.value.status_code == 400
