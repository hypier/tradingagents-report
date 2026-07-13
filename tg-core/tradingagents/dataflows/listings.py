"""Provider-neutral parsing for deterministic stock listings.

The API receives an already selected listing.  This module translates common
market-qualified user tickers and explicit exchange identifiers into a small
identity object that provider adapters can map to their own symbol formats.
It deliberately performs no market search or network access.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

_SYMBOL_RE = re.compile(r"^[A-Z0-9._\-+=]+$")
_EXCHANGE_RE = re.compile(r"^[A-Z][A-Z0-9_]{1,15}$")

_SUFFIX_TO_EXCHANGE = {
    ".HK": "HKEX",
    ".SS": "SSE",
    ".SZ": "SZSE",
    ".T": "TSE",
    ".TW": "TWSE",
    ".TWO": "TPEX",
}
_EXCHANGE_TO_SUFFIX = {exchange: suffix for suffix, exchange in _SUFFIX_TO_EXCHANGE.items()}
_US_EXCHANGES = frozenset({"NASDAQ", "NYSE", "AMEX"})


@dataclass(frozen=True)
class ListingRef:
    """A deterministic listing identity independent of data providers."""

    exchange: str | None
    symbol: str
    display_ticker: str

    def as_dict(self) -> dict[str, str]:
        result = {"symbol": self.symbol, "display_ticker": self.display_ticker}
        if self.exchange is not None:
            result["exchange"] = self.exchange
        return result


def resolve_listing(ticker: str) -> ListingRef:
    """Parse a legacy ticker or explicit ``EXCHANGE:SYMBOL`` without searching."""
    if not isinstance(ticker, str):
        raise ValueError("ticker must be a string")
    value = ticker.strip().upper()
    if not value:
        raise ValueError("ticker is required")

    if ":" in value:
        exchange, separator, symbol = value.partition(":")
        if not separator or ":" in symbol:
            raise ValueError(f"invalid explicit listing: {ticker!r}")
        return listing_from_parts(exchange, symbol)

    if not _SYMBOL_RE.fullmatch(value) or set(value) == {"."}:
        raise ValueError(f"invalid ticker symbol: {ticker!r}")

    for suffix, exchange in sorted(_SUFFIX_TO_EXCHANGE.items(), key=lambda item: len(item[0]), reverse=True):
        if value.endswith(suffix):
            return listing_from_parts(exchange, value[: -len(suffix)], value)

    return ListingRef(exchange=None, symbol=value, display_ticker=value)


def listing_from_parts(
    exchange: str,
    symbol: str,
    display_ticker: str | None = None,
) -> ListingRef:
    """Build a validated listing from frontend-confirmed exchange and symbol."""
    normalized_exchange = str(exchange).strip().upper()
    normalized_symbol = str(symbol).strip().upper()
    if not _EXCHANGE_RE.fullmatch(normalized_exchange):
        raise ValueError(f"invalid exchange: {exchange!r}")
    if not _SYMBOL_RE.fullmatch(normalized_symbol) or set(normalized_symbol) == {"."}:
        raise ValueError(f"invalid listing symbol: {symbol!r}")

    if normalized_exchange == "HKEX":
        if not normalized_symbol.isdigit():
            raise ValueError("HKEX symbols must be numeric")
        normalized_symbol = str(int(normalized_symbol))
        expected_display_ticker = f"{int(normalized_symbol):04d}.HK"
    elif normalized_exchange in _EXCHANGE_TO_SUFFIX:
        expected_display_ticker = f"{normalized_symbol}{_EXCHANGE_TO_SUFFIX[normalized_exchange]}"
    elif normalized_exchange in _US_EXCHANGES:
        expected_display_ticker = normalized_symbol
    else:
        raise ValueError(f"unsupported exchange: {normalized_exchange}")

    if display_ticker is not None:
        provided_display_ticker = display_ticker.strip().upper()
        if provided_display_ticker != expected_display_ticker:
            raise ValueError(
                f"display_ticker {provided_display_ticker!r} does not match "
                f"{normalized_exchange}:{normalized_symbol}"
            )

    return ListingRef(
        exchange=normalized_exchange,
        symbol=normalized_symbol,
        display_ticker=expected_display_ticker,
    )
