"""TradingView OHLCV, identity, and indicator adapter tests."""

from datetime import datetime, timezone
from unittest.mock import Mock

import pytest

from tradingagents.dataflows.errors import NoMarketDataError
from tradingagents.dataflows.tradingview_stock import (
    fetch_tradingview_ohlcv,
    get_tradingview_identity,
)


def _price_payload(history):
    return {
        "symbol": "NASDAQ:AAPL",
        "history": history,
        "info": {"timezone": "America/New_York"},
    }


def _epoch(date: str) -> int:
    return int(datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp())


def test_ohlcv_explicitly_requests_japanese_candles():
    client = Mock()
    client.get.return_value = _price_payload(
        [
            {
                "time": 1783728000,
                "open": 100,
                "max": 105,
                "min": 99,
                "close": 104,
                "volume": 10,
            },
            {
                "time": 1783641600,
                "open": 98,
                "max": 101,
                "min": 97,
                "close": 100,
                "volume": 9,
            },
        ]
    )

    result = fetch_tradingview_ohlcv(
        "NASDAQ:AAPL", "2026-07-09", "2026-07-10", client=client
    )

    client.get.assert_called_once()
    path = client.get.call_args.args[0]
    params = client.get.call_args.kwargs["params"]
    assert path == "/api/price/NASDAQ:AAPL"
    assert "symbol" not in params
    assert params["type"] == "Japanese"
    assert params["timeframe"] == "D"
    assert params["range"] == 11
    assert params["to"] == int(
        datetime(2026, 7, 10, 23, 59, 59, tzinfo=timezone.utc).timestamp()
    )
    assert list(result.data.columns) == ["Date", "Open", "High", "Low", "Close", "Volume"]
    assert result.data["Date"].is_monotonic_increasing
    assert result.data["Date"].dt.tz is None
    assert result.resolved_symbol == "NASDAQ:AAPL"
    assert result.adjustment_mode == "Japanese"


def test_qualified_symbol_does_not_invoke_market_search():
    client = Mock()
    client.get.return_value = _price_payload(
        [
            {
                "time": _epoch("2026-07-10"),
                "open": 100,
                "max": 105,
                "min": 99,
                "close": 104,
                "volume": 10,
            }
        ]
    )

    fetch_tradingview_ohlcv("NASDAQ:AAPL", "2026-07-10", "2026-07-10", client=client)

    assert client.get.call_count == 1
    assert client.get.call_args.args[0] == "/api/price/NASDAQ:AAPL"


def test_bare_equity_is_resolved_with_documented_market_search():
    client = Mock()
    client.get.side_effect = [
        {
            "markets": [
                {
                    "symbol": "AAPL",
                    "source_id": "NASDAQ",
                    "full_name": "NASDAQ:AAPL",
                    "is_primary_listing": True,
                }
            ]
        },
        _price_payload(
            [
                {
                    "time": _epoch("2026-07-10"),
                    "open": 100,
                    "max": 105,
                    "min": 99,
                    "close": 104,
                    "volume": 10,
                }
            ]
        ),
    ]

    result = fetch_tradingview_ohlcv("AAPL", "2026-07-10", "2026-07-10", client=client)

    assert result.resolved_symbol == "NASDAQ:AAPL"
    assert client.get.call_args_list[0].args[0] == "/api/search/market/AAPL"
    assert client.get.call_args_list[0].kwargs["params"] == {"filter": "stock"}
    assert client.get.call_args_list[1].args[0] == "/api/price/NASDAQ:AAPL"


def test_ohlcv_sorts_and_filters_to_inclusive_requested_dates():
    client = Mock()
    client.get.return_value = _price_payload(
        [
            {"time": _epoch("2026-07-11"), "open": 3, "max": 4, "min": 2, "close": 3, "volume": 3},
            {"time": _epoch("2026-07-09"), "open": 1, "max": 2, "min": 0, "close": 1, "volume": 1},
            {"time": _epoch("2026-07-10"), "open": 2, "max": 3, "min": 1, "close": 2, "volume": 2},
        ]
    )

    result = fetch_tradingview_ohlcv(
        "NASDAQ:AAPL", "2026-07-09", "2026-07-10", client=client
    )

    assert result.data["Date"].dt.strftime("%Y-%m-%d").tolist() == [
        "2026-07-09",
        "2026-07-10",
    ]
    assert result.data["High"].tolist() == [2, 3]
    assert result.data["Low"].tolist() == [0, 1]


def test_ohlcv_includes_end_date_candle_with_intraday_utc_timestamp():
    client = Mock()
    end_date_noon = datetime(2026, 7, 10, 12, tzinfo=timezone.utc)
    client.get.return_value = _price_payload(
        [
            {
                "time": int(end_date_noon.timestamp()),
                "open": 100,
                "max": 105,
                "min": 99,
                "close": 104,
                "volume": 10,
            }
        ]
    )

    result = fetch_tradingview_ohlcv(
        "NASDAQ:AAPL", "2026-07-10", "2026-07-10", client=client
    )

    assert len(result.data) == 1


def test_ohlcv_rejects_empty_history():
    client = Mock()
    client.get.return_value = _price_payload([])

    with pytest.raises(NoMarketDataError, match="no price history"):
        fetch_tradingview_ohlcv("NASDAQ:AAPL", "2026-07-09", "2026-07-10", client=client)


@pytest.mark.parametrize(
    "history",
    [
        [{"time": 1783728000, "open": 100, "max": 105, "min": 99, "volume": 10}],
        [
            {
                "time": 1783728000,
                "open": 100,
                "max": 105,
                "min": 99,
                "close": "not-a-price",
                "volume": 10,
            }
        ],
    ],
)
def test_ohlcv_rejects_invalid_ohlc(history):
    client = Mock()
    client.get.return_value = _price_payload(history)

    with pytest.raises(NoMarketDataError, match="OHLC"):
        fetch_tradingview_ohlcv("NASDAQ:AAPL", "2026-07-10", "2026-07-10", client=client)


def test_identity_maps_company_fields():
    client = Mock()
    client.get.return_value = {
        "symbol": "NASDAQ:AAPL",
        "company": {
            "description": "Apple Inc.",
            "sector": "Technology",
            "industry": "Hardware",
            "listed_exchange": "NASDAQ",
        },
    }

    assert get_tradingview_identity("NASDAQ:AAPL", client=client) == {
        "company_name": "Apple Inc.",
        "sector": "Technology",
        "industry": "Hardware",
        "exchange": "NASDAQ",
        "quote_type": "stock",
    }
    client.get.assert_called_once_with("/api/market-data/NASDAQ:AAPL/company")
