"""TradingView-specific symbol resolution at the provider boundary."""

from __future__ import annotations

from collections.abc import Callable, Iterable, Mapping
from typing import Any

from ..errors import NoMarketDataError
from ..listings import resolve_listing
from ..provider_models import InstrumentRef, ProviderSymbol

_DETERMINISTIC_SYMBOLS = {
    "0700.HK": "HKEX:700",
    "600519.SS": "SSE:600519",
    "BTC-USDT": "BINANCE:BTCUSDT",
    "EURUSD": "OANDA:EURUSD",
    "SPX500": "SP:SPX",
    "XAUUSD": "COMEX:GC1!",
}

_EXCHANGE_PREFERENCE = {"NASDAQ": 0, "NYSE": 1, "AMEX": 2}


def _provider_symbol(symbol: str, resolution_source: str = "deterministic") -> ProviderSymbol:
    exchange = symbol.split(":", 1)[0] if ":" in symbol else None
    return ProviderSymbol(
        provider="tradingview",
        symbol=symbol,
        exchange=exchange,
        resolution_source=resolution_source,
    )


def _market_symbol(market: Mapping[str, Any]) -> str | None:
    symbol = market.get("full_name") or market.get("id")
    return symbol if isinstance(symbol, str) and symbol.strip() else None


def _exchange(market: Mapping[str, Any]) -> str:
    source = market.get("source_id")
    if isinstance(source, str) and source:
        return source.upper()
    symbol = _market_symbol(market)
    return symbol.split(":", 1)[0].upper() if symbol and ":" in symbol else ""


def resolve_tradingview_symbol(
    ref: InstrumentRef,
    search: Callable[[str], Iterable[Mapping[str, Any]]] | None = None,
) -> ProviderSymbol:
    """Resolve an instrument into a TradingView symbol without changing the input contract."""
    try:
        listing = resolve_listing(ref.raw_symbol)
    except ValueError:
        listing = None
    if listing is not None and listing.exchange is not None:
        return _provider_symbol(listing.provider_symbol or f"{listing.exchange}:{listing.symbol}")


    if ref.exchange_hint:
        return _provider_symbol(f"{ref.exchange_hint}:{ref.canonical_symbol}")

    deterministic = _DETERMINISTIC_SYMBOLS.get(ref.canonical_symbol)
    if deterministic:
        return _provider_symbol(deterministic)

    markets = search(ref.canonical_symbol) if search is not None else ()
    exact_matches = [
        market
        for market in markets
        if str(market.get("symbol", "")).upper() == ref.canonical_symbol
        and _market_symbol(market) is not None
    ]
    exact_matches.sort(
        key=lambda market: (
            not bool(market.get("is_primary_listing")),
            _EXCHANGE_PREFERENCE.get(_exchange(market), len(_EXCHANGE_PREFERENCE)),
        )
    )
    if exact_matches:
        return _provider_symbol(_market_symbol(exact_matches[0]), resolution_source="search")

    raise NoMarketDataError(ref.raw_symbol, detail="TradingView symbol could not be resolved")
