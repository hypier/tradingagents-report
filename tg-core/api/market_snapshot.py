from __future__ import annotations

from datetime import date
from typing import Any

import pandas as pd

from tradingagents.dataflows.interface import route_structured
from tradingagents.dataflows.listings import resolve_listing
from tradingagents.dataflows.provider_models import ProviderResult
from tradingagents.dataflows.structured_data import get_instrument_identity


def read_snapshot(ticker: str) -> dict[str, Any]:
    listing = resolve_listing(ticker)
    end_date = date.today().isoformat()
    result = route_structured(
        "get_ohlcv",
        listing.display_ticker,
        (date.today().replace(day=1)).isoformat(),
        end_date,
    )
    if not isinstance(result, ProviderResult) or not isinstance(result.data, pd.DataFrame):
        raise TypeError("Structured OHLCV route returned an unexpected result type")

    frame = result.data.sort_values("Date")
    if len(frame) < 2:
        raise ValueError("At least two OHLCV bars are required for a market snapshot")
    latest, previous = frame.iloc[-1], frame.iloc[-2]
    latest_close = float(latest["Close"])
    previous_close = float(previous["Close"])
    identity = get_instrument_identity(listing.display_ticker)
    as_of = result.as_of or pd.Timestamp(latest["Date"]).to_pydatetime()

    return {
        "ticker": listing.display_ticker,
        "display_name": identity.get("company_name", listing.display_ticker),
        "last_price": latest_close,
        "currency": result.quote_currency or "USD",
        "change_percent": ((latest_close - previous_close) / previous_close) * 100,
        "as_of": as_of,
        "source": result.provider,
    }
