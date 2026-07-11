"""TradingView adapters for fundamentals and financial statements."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date, datetime, timezone
from typing import Any
from urllib.parse import quote

import pandas as pd

from .errors import NoMarketDataError
from .provider_models import parse_instrument
from .tradingview_client import TradingViewClient
from .tradingview_symbols import resolve_tradingview_symbol

_FUNDAMENTAL_FIELDS = (
    ("company", "description", "Name"),
    ("company", "sector", "Sector"),
    ("company", "industry", "Industry"),
    ("indicators", "market_cap_basic", "Market Cap"),
    ("indicators", "price_earnings", "PE Ratio (TTM)"),
    ("indicators", "price_book_ratio", "Price to Book"),
    ("indicators", "price_52_week_high", "52 Week High"),
    ("indicators", "price_52_week_low", "52 Week Low"),
    ("ttm", "earnings_per_share_diluted_ttm", "EPS (TTM)"),
    ("ttm", "total_revenue_ttm", "Revenue (TTM)"),
    ("ttm", "gross_profit_ttm", "Gross Profit"),
    ("ttm", "ebitda_ttm", "EBITDA"),
    ("ttm", "net_income_ttm", "Net Income"),
    ("ttm", "net_margin_ttm", "Profit Margin"),
    ("ttm", "operating_margin_ttm", "Operating Margin"),
    ("ttm", "return_on_equity_ttm", "Return on Equity"),
    ("ttm", "return_on_assets_ttm", "Return on Assets"),
    ("ttm", "debt_to_equity_ttm", "Debt to Equity"),
    ("current", "current_ratio_current", "Current Ratio"),
    ("current", "book_value_per_share_current", "Book Value"),
    ("ttm", "free_cash_flow_ttm", "Free Cash Flow"),
)

# TradingView exposes all statement fields in the same response shape. These
# explicit families keep the three compatibility adapters semantically distinct.
_BALANCE_SHEET_PREFIXES = (
    "accounts_payable",
    "accounts_receivable",
    "book_value",
    "capital_surplus",
    "cash_n_",
    "common_stock",
    "deferred_tax_asset",
    "deferred_tax_liabilit",
    "goodwill",
    "intangible_asset",
    "inventor",
    "long_term_debt",
    "long_term_investment",
    "minority_interest",
    "net_debt",
    "other_asset",
    "other_liabilit",
    "preferred_stock",
    "property_plant_equipment",
    "retained_earning",
    "short_term_debt",
    "total_asset",
    "total_current_asset",
    "total_current_liabilit",
    "total_debt",
    "total_equity",
    "total_liabilit",
    "treasury_stock",
)
_CASH_FLOW_PREFIXES = (
    "capital_expenditure",
    "cash_f_",
    "change_in_",
    "dividends_paid",
    "free_cash_flow",
    "issuance_of_",
    "net_cash_flow",
    "repurchase_of_",
)
_INCOME_STATEMENT_PREFIXES = (
    "basic_eps",
    "cost_of_",
    "depreciation_amortization",
    "diluted_eps",
    "earnings_per_share",
    "ebit",
    "gross_profit",
    "income_tax",
    "interest_expense",
    "net_income",
    "normalized_income",
    "operating_expense",
    "operating_income",
    "pretax_income",
    "research_development",
    "revenue",
    "selling_general_admin",
    "total_revenue",
)


def _search_markets(client: TradingViewClient, query: str, asset_class: str):
    filter_name = {"equity": "stock"}.get(asset_class, asset_class)
    payload = client.get(
        f"/api/search/market/{quote(query, safe='')}",
        params={"filter": filter_name},
    )
    markets = payload.get("markets", [])
    return markets if isinstance(markets, list) else []


def _resolve(ticker: str, client: TradingViewClient) -> str:
    ref = parse_instrument(ticker)
    search = None
    if not ref.exchange_hint:

        def search(query: str):
            return _search_markets(client, query, ref.asset_class)

    return resolve_tradingview_symbol(ref, search=search).symbol


def _header(title: str, symbol: str, freq: str | None = None) -> str:
    suffix = f" ({freq})" if freq is not None else ""
    header = f"# {title} for {symbol}{suffix}\n"
    header += f"# Data retrieved on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
    return header


def get_tradingview_fundamentals(
    ticker: str,
    curr_date: str | None = None,
    *,
    client: TradingViewClient | None = None,
) -> str:
    """Return a TradingView fundamentals overview in the existing text format."""
    del curr_date
    api = client or TradingViewClient()
    symbol = _resolve(ticker, api)
    payload = api.get(f"/api/market-data/{symbol}")

    lines = []
    for section_name, field, label in _FUNDAMENTAL_FIELDS:
        section = payload.get(section_name)
        value = section.get(field) if isinstance(section, Mapping) else None
        if value is not None and not isinstance(value, (dict, list)):
            lines.append(f"{label}: {value}")

    if not lines:
        raise NoMarketDataError(ticker, symbol, "no fundamental fields returned")
    return _header("Company Fundamentals", symbol) + "\n".join(lines)


def _fiscal_end(value: Any) -> date | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        try:
            return datetime.fromtimestamp(value, tz=timezone.utc).date()
        except (OverflowError, OSError, ValueError):
            return None
    if isinstance(value, str):
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def _is_cell(value: Any) -> bool:
    return value is not None and not isinstance(value, (dict, list))


def _allowed_fields(
    data: Mapping[str, Any], suffix: str, prefixes: tuple[str, ...]
) -> dict[str, Any]:
    fields = {}
    for key, value in data.items():
        if not isinstance(key, str) or not key.endswith(suffix):
            continue
        field = key[: -len(suffix)]
        if field.startswith(prefixes):
            fields[field] = value
    return fields


def _statement_frame(
    current: Mapping[str, Any],
    history: Mapping[str, Any],
    frequency: str,
    curr_date: str | None,
    prefixes: tuple[str, ...],
) -> pd.DataFrame:
    period_suffix = "fq" if frequency == "quarterly" else "fy"
    period_key = f"fiscal_period_{period_suffix}"
    period_end_key = f"fiscal_period_end_{period_suffix}"
    value_suffix = f"_{period_suffix}"
    cutoff = date.fromisoformat(curr_date) if curr_date is not None else None
    periods: dict[str, dict[str, Any]] = {}

    current_period = current.get(period_key)
    current_end = _fiscal_end(current.get(period_end_key))
    if (
        isinstance(current_period, str)
        and current_period
        and (cutoff is None or (current_end is not None and current_end <= cutoff))
    ):
        values = {
            field: value
            for field, value in _allowed_fields(current, value_suffix, prefixes).items()
            if _is_cell(value)
        }
        if values:
            periods[current_period] = {"end": current_end, "values": values}

    history_periods = history.get(f"{period_key}_h")
    history_ends = history.get(f"{period_end_key}_h")
    history_fields = _allowed_fields(history, f"{value_suffix}_h", prefixes)
    if isinstance(history_periods, list) and isinstance(history_ends, list):
        for index, period in enumerate(history_periods):
            if not isinstance(period, str) or not period or index >= len(history_ends):
                continue
            fiscal_end = _fiscal_end(history_ends[index])
            if cutoff is not None and (fiscal_end is None or fiscal_end > cutoff):
                continue
            values = {
                field: series[index]
                for field, series in history_fields.items()
                if isinstance(series, list)
                and index < len(series)
                and _is_cell(series[index])
            }
            if not values:
                continue
            if period in periods:
                for field, value in values.items():
                    periods[period]["values"].setdefault(field, value)
            else:
                periods[period] = {"end": fiscal_end, "values": values}

    ordered_periods = sorted(
        periods,
        key=lambda period: (periods[period]["end"] or date.min, period),
        reverse=True,
    )
    fields = sorted(
        {
            field
            for period in ordered_periods
            for field in periods[period]["values"]
        }
    )
    return pd.DataFrame(
        {
            period: {
                field: periods[period]["values"].get(field) for field in fields
            }
            for period in ordered_periods
        },
        index=fields,
    )


def _get_statement(
    ticker: str,
    freq: str,
    curr_date: str | None,
    title: str,
    detail: str,
    prefixes: tuple[str, ...],
    client: TradingViewClient | None,
) -> str:
    frequency = "quarterly" if freq.lower() == "quarterly" else "annual"
    api = client or TradingViewClient()
    symbol = _resolve(ticker, api)
    current_key = f"financials_{frequency}"
    history_key = f"history_{frequency}"
    current_payload = api.get(f"/api/market-data/{symbol}/financials-{frequency}")
    history_payload = api.get(f"/api/market-data/{symbol}/history-{frequency}")
    current = current_payload.get(current_key)
    history = history_payload.get(history_key)
    frame = _statement_frame(
        current if isinstance(current, Mapping) else {},
        history if isinstance(history, Mapping) else {},
        frequency,
        curr_date,
        prefixes,
    )
    if frame.empty:
        raise NoMarketDataError(ticker, symbol, f"no {detail} data")
    return _header(title, symbol, freq) + frame.to_csv()


def get_tradingview_balance_sheet(
    ticker: str,
    freq: str = "quarterly",
    curr_date: str | None = None,
    *,
    client: TradingViewClient | None = None,
) -> str:
    """Return a TradingView balance sheet in the existing CSV format."""
    return _get_statement(
        ticker,
        freq,
        curr_date,
        "Balance Sheet data",
        "balance sheet",
        _BALANCE_SHEET_PREFIXES,
        client,
    )


def get_tradingview_cashflow(
    ticker: str,
    freq: str = "quarterly",
    curr_date: str | None = None,
    *,
    client: TradingViewClient | None = None,
) -> str:
    """Return a TradingView cash-flow statement in the existing CSV format."""
    return _get_statement(
        ticker,
        freq,
        curr_date,
        "Cash Flow data",
        "cash flow",
        _CASH_FLOW_PREFIXES,
        client,
    )


def get_tradingview_income_statement(
    ticker: str,
    freq: str = "quarterly",
    curr_date: str | None = None,
    *,
    client: TradingViewClient | None = None,
) -> str:
    """Return a TradingView income statement in the existing CSV format."""
    return _get_statement(
        ticker,
        freq,
        curr_date,
        "Income Statement data",
        "income statement",
        _INCOME_STATEMENT_PREFIXES,
        client,
    )
