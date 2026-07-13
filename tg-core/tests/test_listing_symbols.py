import pytest

from tradingagents.dataflows.listings import listing_from_parts, resolve_listing


@pytest.mark.parametrize(
    ("ticker", "exchange", "symbol", "display_ticker"),
    [
        ("0005.HK", "HKEX", "5", "0005.HK"),
        ("0700.HK", "HKEX", "700", "0700.HK"),
        ("600519.SS", "SSE", "600519", "600519.SS"),
        ("000001.SZ", "SZSE", "000001", "000001.SZ"),
        ("7203.T", "TSE", "7203", "7203.T"),
        ("2330.TW", "TWSE", "2330", "2330.TW"),
        ("6488.TWO", "TPEX", "6488", "6488.TWO"),
    ],
)
def test_resolve_listing_maps_market_qualified_tickers(
    ticker, exchange, symbol, display_ticker
):
    listing = resolve_listing(ticker)

    assert listing.exchange == exchange
    assert listing.symbol == symbol
    assert listing.display_ticker == display_ticker


def test_resolve_listing_accepts_explicit_exchange_symbol():
    listing = resolve_listing("hkex:5")

    assert listing.exchange == "HKEX"
    assert listing.symbol == "5"
    assert listing.display_ticker == "0005.HK"


def test_listing_from_parts_validates_display_ticker_matches_listing():
    with pytest.raises(ValueError, match="does not match"):
        listing_from_parts("HKEX", "5", "0700.HK")


@pytest.mark.parametrize("ticker", ["../AAPL", "HKEX:5/../secret", "..."])
def test_resolve_listing_rejects_unsafe_ticker(ticker):
    with pytest.raises(ValueError):
        resolve_listing(ticker)
