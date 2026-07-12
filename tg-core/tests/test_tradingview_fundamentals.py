"""TradingView fundamentals and financial-statement adapter tests."""

import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from threading import Event
from unittest.mock import Mock

import pytest

from tradingagents.dataflows.errors import NoMarketDataError
from tradingagents.dataflows.tradingview.fundamentals import (
    get_tradingview_balance_sheet,
    get_tradingview_cashflow,
    get_tradingview_fundamentals,
    get_tradingview_income_statement,
)


def epoch(date: str) -> int:
    """Convert an ISO date to Unix UTC seconds for TradingView test payloads."""
    return int(datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp())


def test_fundamentals_uses_existing_labels_and_exact_endpoint():
    client = Mock()
    client.get.return_value = {
        "symbol": "NASDAQ:AAPL",
        "company": {
            "description": "Apple Inc.",
            "sector": "Technology",
            "industry": "Hardware",
        },
        "indicators": {
            "market_cap_basic": 1000,
            "price_earnings": 20,
            "price_book_ratio": 8,
            "price_52_week_high": 210,
            "price_52_week_low": 120,
        },
        "ttm": {
            "earnings_per_share_diluted_ttm": 5,
            "total_revenue_ttm": 900,
            "gross_profit_ttm": 400,
            "ebitda_ttm": 250,
            "net_income_ttm": 100,
            "net_margin_ttm": 0.11,
            "operating_margin_ttm": 0.15,
            "return_on_equity_ttm": 0.3,
            "return_on_assets_ttm": 0.2,
            "debt_to_equity_ttm": 1.5,
            "free_cash_flow_ttm": 80,
        },
        "current": {
            "current_ratio_current": 1.2,
            "book_value_per_share_current": 4.5,
        },
    }

    output = get_tradingview_fundamentals("NASDAQ:AAPL", "2026-07-11", client=client)

    assert "# Company Fundamentals for NASDAQ:AAPL" in output
    assert "Name: Apple Inc." in output
    assert "Sector: Technology" in output
    assert "Market Cap: 1000" in output
    assert "PE Ratio (TTM): 20" in output
    assert "Price to Book: 8" in output
    assert "EPS (TTM): 5" in output
    assert "Revenue (TTM): 900" in output
    assert "Free Cash Flow: 80" in output
    assert "Book Value: 4.5" in output
    client.get.assert_called_once_with("/api/market-data/NASDAQ:AAPL")


def test_fundamentals_omits_missing_values_and_rejects_unmapped_payload():
    client = Mock()
    client.get.return_value = {
        "symbol": "NASDAQ:AAPL",
        "company": {"description": None},
        "indicators": {"unmapped": 1},
    }

    with pytest.raises(NoMarketDataError, match="no fundamental fields"):
        get_tradingview_fundamentals("NASDAQ:AAPL", client=client)


def statement_client_with_periods(field, periods):
    period_ends = [epoch("2026-06-30"), epoch("2026-03-31"), epoch("2025-12-31")]
    client = Mock()
    client.get.return_value = {
        "symbol": "NASDAQ:AAPL",
        "financials_quarterly": {
            f"{field}_fq": 30,
            "fiscal_period_fq": periods[0],
            "fiscal_period_end_fq": period_ends[0],
        },
        "history_quarterly": {
            f"{field}_fq_h": [30, 20, 10],
            "fiscal_period_fq_h": periods,
            "fiscal_period_end_fq_h": period_ends,
        },
    }
    return client


def test_default_clients_share_one_market_data_request(monkeypatch):
    request_started = Event()
    release_request = Event()
    client = Mock()

    def response(path, params=None):
        assert path == "/api/market-data/NASDAQ:CACHE"
        request_started.set()
        assert release_request.wait(timeout=2)
        return {
            "symbol": "NASDAQ:CACHE",
            "company": {"description": "Cache Corp"},
            "indicators": {"market_cap_basic": 1000},
            "financials_quarterly": {
                "total_assets_fq": 100,
                "cash_f_operating_activities_fq": 50,
                "total_revenue_fq": 80,
                "fiscal_period_fq": "2026-Q1",
                "fiscal_period_end_fq": epoch("2026-03-31"),
            },
            "history_quarterly": {
                "total_assets_fq_h": [90],
                "cash_f_operating_activities_fq_h": [40],
                "total_revenue_fq_h": [70],
                "fiscal_period_fq_h": ["2025-Q4"],
                "fiscal_period_end_fq_h": [epoch("2025-12-31")],
            },
        }

    client.get.side_effect = response
    monkeypatch.setattr(
        "tradingagents.dataflows.tradingview.fundamentals.TradingViewClient",
        Mock(return_value=client),
    )

    functions = [
        get_tradingview_fundamentals,
        get_tradingview_balance_sheet,
        get_tradingview_cashflow,
        get_tradingview_income_statement,
    ]
    with ThreadPoolExecutor(max_workers=len(functions)) as executor:
        futures = [executor.submit(function, "NASDAQ:CACHE") for function in functions]
        assert request_started.wait(timeout=2)
        release_request.set()
        outputs = [future.result(timeout=2) for future in futures]

    assert all(outputs)
    client.get.assert_called_once_with("/api/market-data/NASDAQ:CACHE")


def test_default_market_data_cache_expires(monkeypatch):
    now = [100.0]
    client = Mock()
    client.get.return_value = {
        "symbol": "NASDAQ:TTL",
        "company": {"description": "TTL Corp"},
    }
    monkeypatch.setattr(time, "monotonic", lambda: now[0])
    monkeypatch.setattr(
        "tradingagents.dataflows.tradingview.fundamentals.TradingViewClient",
        Mock(return_value=client),
    )

    get_tradingview_fundamentals("NASDAQ:TTL")
    get_tradingview_fundamentals("NASDAQ:TTL")
    now[0] += 301
    get_tradingview_fundamentals("NASDAQ:TTL")

    assert client.get.call_count == 2


@pytest.mark.parametrize(
    ("function", "title", "required_field"),
    [
        (get_tradingview_balance_sheet, "Balance Sheet", "total_assets"),
        (get_tradingview_cashflow, "Cash Flow", "cash_f_operating_activities"),
        (get_tradingview_income_statement, "Income Statement", "total_revenue"),
    ],
)
def test_statement_filters_fields_and_future_periods(function, title, required_field):
    client = statement_client_with_periods(required_field, ["2026-Q2", "2026-Q1", "2025-Q4"])

    output = function("NASDAQ:AAPL", "quarterly", "2026-03-31", client=client)

    assert f"# {title} data for NASDAQ:AAPL (quarterly)" in output
    assert "2026-Q1" in output
    assert "2025-Q4" in output
    assert "2026-Q2" not in output
    assert required_field in output
    client.get.assert_called_once_with("/api/market-data/NASDAQ:AAPL")


def test_annual_statement_reconstructs_history_and_deduplicates_current_period():
    client = Mock()
    client.get.return_value = {
        "financials_annual": {
            "total_revenue_fy": 300,
            "fiscal_period_fy": "FY-2025",
            "fiscal_period_end_fy": epoch("2025-12-31"),
        },
        "history_annual": {
            "total_revenue_fy_h": [299, 200],
            "fiscal_period_fy_h": ["FY-2025", "FY-2024"],
            "fiscal_period_end_fy_h": [
                epoch("2025-12-31"),
                epoch("2024-12-31"),
            ],
        },
    }

    output = get_tradingview_income_statement("NASDAQ:AAPL", "annual", "2026-01-01", client=client)

    assert output.count("FY-2025") == 1
    assert "total_revenue,300,200" in output
    client.get.assert_called_once_with("/api/market-data/NASDAQ:AAPL")


@pytest.mark.parametrize(
    ("function", "included", "excluded"),
    [
        (get_tradingview_balance_sheet, "total_assets", "total_revenue"),
        (get_tradingview_cashflow, "cash_f_operating_activities", "total_assets"),
        (get_tradingview_income_statement, "total_revenue", "cash_f_operating_activities"),
    ],
)
def test_statement_uses_distinct_field_family_and_excludes_nested_values(
    function, included, excluded
):
    client = Mock()
    client.get.return_value = {
        "financials_quarterly": {
            "total_assets_fq": 100,
            "cash_f_operating_activities_fq": 50,
            "total_revenue_fq": 80,
            f"{included}_exchange_rate_fq": {"USD": 1},
            "fiscal_period_fq": "2026-Q1",
            "fiscal_period_end_fq": epoch("2026-03-31"),
        },
        "history_quarterly": {},
    }

    output = function("NASDAQ:AAPL", client=client)

    assert included in output
    assert excluded not in output
    assert "exchange_rate" not in output


@pytest.mark.parametrize(
    ("function", "included_fields", "excluded_fields"),
    [
        (
            get_tradingview_balance_sheet,
            [
                "total_assets",
                "total_current_assets",
                "cash_n_equivalents",
                "total_inventory",
                "accounts_receivables_net",
                "total_receivables_net",
                "ppe_total_net",
                "goodwill",
                "total_liabilities",
                "total_current_liabilities",
                "long_term_debt",
                "shrhldrs_equity",
                "common_equity_total",
                "total_equity",
            ],
            [
                "oper_income",
                "interest_expense_on_debt",
                "common_dividends_cash_flow",
            ],
        ),
        (
            get_tradingview_income_statement,
            [
                "total_revenue",
                "revenue",
                "cost_of_goods",
                "gross_profit",
                "oper_income",
                "research_and_dev",
                "sell_gen_admin_exp_total",
                "ebit",
                "ebitda",
                "pretax_income",
                "income_tax",
                "interest_expense_on_debt",
                "net_income",
            ],
            ["total_assets", "cash_f_operating_activities"],
        ),
        (
            get_tradingview_cashflow,
            [
                "cash_f_operating_activities",
                "cash_f_investing_activities",
                "cash_f_financing_activities",
                "capital_expenditures",
                "common_dividends_cash_flow",
                "total_cash_dividends_paid",
                "purchase_of_stock",
                "reduction_of_long_term_debt",
                "purchase_of_investments",
                "non_cash_items",
                "changes_in_working_capital",
                "free_cash_flow",
            ],
            ["total_assets", "total_revenue", "interest_expense_on_debt"],
        ),
    ],
)
def test_statement_classifies_provider_native_current_and_history_fields(
    function, included_fields, excluded_fields
):
    all_fields = included_fields + excluded_fields
    client = Mock()
    client.get.return_value = {
        "financials_quarterly": {
            **{f"{field}_fq": 100 + index for index, field in enumerate(all_fields)},
            f"{included_fields[0]}_rates_fq": {"USD": 1},
            "fiscal_period_fq": "2026-Q1",
            "fiscal_period_end_fq": epoch("2026-03-31"),
        },
        "history_quarterly": {
            **{f"{field}_fq_h": [90 + index] for index, field in enumerate(all_fields)},
            f"{included_fields[0]}_rates_fq_h": [{"USD": 1}],
            "fiscal_period_fq_h": ["2025-Q4"],
            "fiscal_period_end_fq_h": [epoch("2025-12-31")],
        },
    }

    output = function("NASDAQ:AAPL", "quarterly", "2026-03-31", client=client)

    assert ",2026-Q1,2025-Q4" in output
    for index, field in enumerate(included_fields):
        assert f"{field},{100 + index},{90 + index}" in output
    for field in excluded_fields:
        assert field not in output
    assert "_rates" not in output


def test_duplicate_current_period_backfills_history_end_before_cutoff_and_sorting():
    client = Mock()
    client.get.return_value = {
        "financials_annual": {
            "total_revenue_fy": 300,
            "fiscal_period_fy": "FY-2025",
            "fiscal_period_end_fy": None,
        },
        "history_annual": {
            "total_revenue_fy_h": [299, 200],
            "fiscal_period_fy_h": ["FY-2025", "FY-2024"],
            "fiscal_period_end_fy_h": [
                epoch("2025-12-31"),
                epoch("2024-12-31"),
            ],
        },
    }

    output = get_tradingview_income_statement("NASDAQ:AAPL", "annual", "2025-12-31", client=client)

    assert ",FY-2025,FY-2024" in output
    assert "total_revenue,300,200" in output


def test_duplicate_period_backfills_end_when_matching_history_cells_are_null():
    client = Mock()
    client.get.return_value = {
        "financials_annual": {
            "total_revenue_fy": 300,
            "fiscal_period_fy": "FY-2025",
            "fiscal_period_end_fy": None,
        },
        "history_annual": {
            "total_revenue_fy_h": [None, 200],
            "fiscal_period_fy_h": ["FY-2025", "FY-2024"],
            "fiscal_period_end_fy_h": [
                epoch("2025-12-31"),
                epoch("2024-12-31"),
            ],
        },
    }

    output = get_tradingview_income_statement("NASDAQ:AAPL", "annual", "2025-12-31", client=client)

    assert ",FY-2025,FY-2024" in output
    assert "total_revenue,300,200" in output


def test_statement_raises_when_date_filter_removes_every_period():
    client = statement_client_with_periods("total_assets", ["2026-Q2", "2026-Q1", "2025-Q4"])

    with pytest.raises(NoMarketDataError, match="no balance sheet data"):
        get_tradingview_balance_sheet("NASDAQ:AAPL", "quarterly", "2025-01-01", client=client)
