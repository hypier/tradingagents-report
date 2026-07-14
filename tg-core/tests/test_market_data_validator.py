"""Tests for the deterministic market-data verification snapshot (#830/#881)."""

from __future__ import annotations

from unittest.mock import Mock

import pandas as pd
import pytest

import tradingagents.dataflows.market_data_validator as validator
import tradingagents.dataflows.structured_data as structured_data
from tradingagents.dataflows.provider_models import ProviderResult, parse_instrument


def _sample_ohlcv() -> pd.DataFrame:
    dates = pd.bdate_range("2026-04-01", "2026-05-20")
    closes = [100 + i for i in range(len(dates))]
    return pd.DataFrame({
        "Date": dates,
        "Open": [c - 0.5 for c in closes],
        "High": [c + 1.0 for c in closes],
        "Low": [c - 1.0 for c in closes],
        "Close": closes,
        "Volume": [1_000_000 + i for i in range(len(dates))],
    })


@pytest.mark.unit
class TestVerifiedSnapshot:
    def test_displays_quote_currency_from_ohlcv_metadata(self, monkeypatch):
        data = _sample_ohlcv()
        data.attrs["quote_currency"] = "HKD"
        monkeypatch.setattr(validator, "get_ohlcv", lambda *args: data)

        snap = validator.build_verified_market_snapshot("0700.HK", "2026-05-13")

        assert "Quote currency: HKD" in snap

    def test_excludes_future_rows(self, monkeypatch):
        data = pd.concat([
            _sample_ohlcv(),
            pd.DataFrame({"Date": [pd.Timestamp("2026-06-01")], "Open": [999.0],
                          "High": [999.0], "Low": [999.0], "Close": [999.0], "Volume": [999]}),
        ], ignore_index=True)
        monkeypatch.setattr(validator, "get_ohlcv", lambda *args: data)

        snap = validator.build_verified_market_snapshot("COF", "2026-05-13")
        assert "Verified market data snapshot for COF" in snap
        assert "Requested analysis date: 2026-05-13" in snap
        assert "Latest trading row used: 2026-05-13" in snap
        assert "999.00" not in snap          # future row excluded
        assert "boll_lb" in snap             # indicators present

    def test_uses_previous_trading_day_when_date_is_weekend(self, monkeypatch):
        monkeypatch.setattr(validator, "get_ohlcv", lambda *args: _sample_ohlcv())
        # 2026-05-16 is a Saturday; latest row should be Fri 2026-05-15
        snap = validator.build_verified_market_snapshot("COF", "2026-05-16")
        assert "Latest trading row used: 2026-05-15" in snap
        assert "Recent verified closes" in snap

    def test_raises_when_no_rows_on_or_before_date(self, monkeypatch):
        monkeypatch.setattr(validator, "get_ohlcv", lambda *args: _sample_ohlcv())
        with pytest.raises(ValueError):
            validator.build_verified_market_snapshot("COF", "2020-01-01")

    def test_raises_on_empty_data(self, monkeypatch):
        monkeypatch.setattr(validator, "get_ohlcv", lambda *args: pd.DataFrame())
        with pytest.raises(ValueError):
            validator.build_verified_market_snapshot("COF", "2026-05-13")

    def test_look_back_window_capped_at_30(self, monkeypatch):
        monkeypatch.setattr(validator, "get_ohlcv", lambda *args: _sample_ohlcv())
        snap = validator.build_verified_market_snapshot("COF", "2026-05-20", look_back_days=999)
        # last-N closes table has at most 30 data rows
        close_rows = [ln for ln in snap.splitlines() if ln.startswith("| 2026-")]
        assert 0 < len(close_rows) <= 30

    def test_verified_rows_uses_structured_ohlcv_for_one_year(self, monkeypatch):
        frame = pd.DataFrame(
            {
                "Date": ["2026-07-10"],
                "Open": [1],
                "High": [2],
                "Low": [1],
                "Close": [2],
                "Volume": [3],
            }
        )
        fetch = Mock(return_value=frame)
        monkeypatch.setattr(validator, "get_ohlcv", fetch)

        result = validator._verified_rows("AAPL", "2026-07-10")

        fetch.assert_called_once_with("AAPL", "2025-07-10", "2026-07-10")
        assert result.iloc[-1]["Close"] == 2


@pytest.mark.unit
class TestStructuredDataFacade:
    def test_get_ohlcv_unwraps_provider_result_and_returns_copy(self, monkeypatch):
        frame = _sample_ohlcv()
        routed = ProviderResult(
            data=frame,
            provider="tradingview",
            requested=parse_instrument("COF"),
            resolved_symbol="NYSE:COF",
            quote_currency="USD",
        )
        route = Mock(return_value=routed)
        monkeypatch.setattr(structured_data, "route_structured", route)

        result = structured_data.get_ohlcv("COF", "2026-04-01", "2026-05-20")

        route.assert_called_once_with("get_ohlcv", "COF", "2026-04-01", "2026-05-20")
        assert result.equals(frame)
        assert result is not frame
        assert result.attrs["quote_currency"] == "USD"

    @pytest.mark.parametrize(
        "routed",
        [
            pd.DataFrame(),
            pd.DataFrame({"Close": [1]}),
            {"Close": [1]},
            ProviderResult(
                data=[1],
                provider="tradingview",
                requested=parse_instrument("COF"),
                resolved_symbol="NYSE:COF",
            ),
        ],
    )
    def test_get_ohlcv_rejects_empty_or_unexpected_results(self, monkeypatch, routed):
        monkeypatch.setattr(structured_data, "route_structured", lambda *args: routed)

        with pytest.raises((TypeError, ValueError)):
            structured_data.get_ohlcv("COF", "2026-04-01", "2026-05-20")


@pytest.mark.unit
class TestTool:
    def test_tool_delegates_to_builder(self, monkeypatch):
        from tradingagents.agents.utils.market_data_validation_tools import (
            get_verified_market_snapshot,
        )
        monkeypatch.setattr(validator, "get_ohlcv", lambda *args: _sample_ohlcv())
        out = get_verified_market_snapshot.invoke(
            {"symbol": "COF", "curr_date": "2026-05-20"}
        )
        assert "Verified market data snapshot for COF" in out
