import logging
import re
from collections.abc import Callable, Mapping
from types import MappingProxyType
from typing import Any

import pandas as pd

from .alpha_vantage import (
    get_balance_sheet as get_alpha_vantage_balance_sheet,
    get_cashflow as get_alpha_vantage_cashflow,
    get_fundamentals as get_alpha_vantage_fundamentals,
    get_global_news as get_alpha_vantage_global_news,
    get_income_statement as get_alpha_vantage_income_statement,
    get_indicator as get_alpha_vantage_indicator,
    get_insider_transactions as get_alpha_vantage_insider_transactions,
    get_news as get_alpha_vantage_news,
    get_stock as get_alpha_vantage_stock,
)
from .alpha_vantage_stock import fetch_alpha_vantage_ohlcv
from .config import get_config
from .errors import (
    NoMarketDataError,
    VendorNotConfiguredError,
    VendorRateLimitError,
)
from .fred import get_macro_data as get_fred_macro_data
from .polymarket import get_prediction_markets as get_polymarket_prediction_markets
from .provider_models import ProviderResult
from .tradingview_fundamentals import (
    get_tradingview_balance_sheet,
    get_tradingview_cashflow,
    get_tradingview_fundamentals,
    get_tradingview_income_statement,
)
from .tradingview_news import get_tradingview_global_news, get_tradingview_news
from .tradingview_stock import (
    fetch_tradingview_ohlcv,
    get_tradingview_identity,
    get_tradingview_indicators,
    get_tradingview_stock,
)
from .y_finance import (
    fetch_yfinance_ohlcv,
    get_balance_sheet as get_yfinance_balance_sheet,
    get_cashflow as get_yfinance_cashflow,
    get_fundamentals as get_yfinance_fundamentals,
    get_income_statement as get_yfinance_income_statement,
    get_insider_transactions as get_yfinance_insider_transactions,
    get_stock_stats_indicators_window,
    get_YFin_data_online,
    get_yfinance_identity,
)
from .yfinance_news import get_global_news_yfinance, get_news_yfinance

logger = logging.getLogger(__name__)

# Tools organized by category
TOOLS_CATEGORIES = {
    "instrument_data": {
        "description": "Instrument identity",
        "tools": ["get_instrument_identity"],
    },
    "core_stock_apis": {
        "description": "OHLCV stock price data",
        "tools": [
            "get_stock_data",
            "get_ohlcv",
        ]
    },
    "technical_indicators": {
        "description": "Technical analysis indicators",
        "tools": [
            "get_indicators"
        ]
    },
    "fundamental_data": {
        "description": "Company fundamentals",
        "tools": [
            "get_fundamentals",
            "get_balance_sheet",
            "get_cashflow",
            "get_income_statement"
        ]
    },
    "news_data": {
        "description": "News and insider data",
        "tools": [
            "get_news",
            "get_global_news",
            "get_insider_transactions",
        ]
    },
    "macro_data": {
        "description": "Macroeconomic indicators (rates, inflation, labor, growth)",
        "tools": [
            "get_macro_indicators",
        ]
    },
    "prediction_markets": {
        "description": "Market-implied probabilities for forward-looking events",
        "tools": [
            "get_prediction_markets",
        ]
    }
}

VENDOR_LIST = [
    "tradingview",
    "yfinance",
    "fred",
    "polymarket",
    "alpha_vantage",
]

# Optional enrichment categories. These add macro/event context to the news
# analyst but are not core to a decision, so a vendor failure here degrades to a
# sentinel instead of aborting the run (a bad LLM-supplied indicator, a missing
# key, or a network blip should not crash an analysis over flavour data). Core
# categories (prices, fundamentals, news) still raise so a broken primary is loud.
OPTIONAL_CATEGORIES = {"macro_data", "prediction_markets"}

# Mapping of methods to their vendor-specific implementations
VENDOR_METHODS = {
    "get_instrument_identity": {
        "tradingview": get_tradingview_identity,
        "yfinance": get_yfinance_identity,
    },
    # core_stock_apis
    "get_stock_data": {
        "tradingview": get_tradingview_stock,
        "yfinance": get_YFin_data_online,
        "alpha_vantage": get_alpha_vantage_stock,
    },
    "get_ohlcv": {
        "tradingview": fetch_tradingview_ohlcv,
        "yfinance": fetch_yfinance_ohlcv,
        "alpha_vantage": fetch_alpha_vantage_ohlcv,
    },
    # technical_indicators
    "get_indicators": {
        "tradingview": get_tradingview_indicators,
        "yfinance": get_stock_stats_indicators_window,
        "alpha_vantage": get_alpha_vantage_indicator,
    },
    # fundamental_data
    "get_fundamentals": {
        "tradingview": get_tradingview_fundamentals,
        "yfinance": get_yfinance_fundamentals,
        "alpha_vantage": get_alpha_vantage_fundamentals,
    },
    "get_balance_sheet": {
        "tradingview": get_tradingview_balance_sheet,
        "yfinance": get_yfinance_balance_sheet,
        "alpha_vantage": get_alpha_vantage_balance_sheet,
    },
    "get_cashflow": {
        "tradingview": get_tradingview_cashflow,
        "yfinance": get_yfinance_cashflow,
        "alpha_vantage": get_alpha_vantage_cashflow,
    },
    "get_income_statement": {
        "tradingview": get_tradingview_income_statement,
        "yfinance": get_yfinance_income_statement,
        "alpha_vantage": get_alpha_vantage_income_statement,
    },
    # news_data
    "get_news": {
        "tradingview": get_tradingview_news,
        "yfinance": get_news_yfinance,
        "alpha_vantage": get_alpha_vantage_news,
    },
    "get_global_news": {
        "tradingview": get_tradingview_global_news,
        "yfinance": get_global_news_yfinance,
        "alpha_vantage": get_alpha_vantage_global_news,
    },
    "get_insider_transactions": {
        "alpha_vantage": get_alpha_vantage_insider_transactions,
        "yfinance": get_yfinance_insider_transactions,
    },
    # macro_data
    "get_macro_indicators": {
        "fred": get_fred_macro_data,
    },
    # prediction_markets
    "get_prediction_markets": {
        "polymarket": get_polymarket_prediction_markets,
    },
}

DEFAULT_VENDOR_CHAINS: Mapping[str, tuple[str, ...]] = MappingProxyType({
    "get_instrument_identity": ("tradingview", "yfinance"),
    "get_stock_data": ("tradingview", "yfinance", "alpha_vantage"),
    "get_ohlcv": ("tradingview", "yfinance", "alpha_vantage"),
    "get_indicators": ("tradingview", "yfinance", "alpha_vantage"),
    "get_fundamentals": ("tradingview", "yfinance", "alpha_vantage"),
    "get_balance_sheet": ("tradingview", "yfinance", "alpha_vantage"),
    "get_cashflow": ("tradingview", "yfinance", "alpha_vantage"),
    "get_income_statement": ("tradingview", "yfinance", "alpha_vantage"),
    "get_news": ("tradingview", "yfinance", "alpha_vantage"),
    "get_global_news": ("tradingview", "yfinance", "alpha_vantage"),
    "get_insider_transactions": ("yfinance", "alpha_vantage"),
    "get_macro_indicators": ("fred",),
    "get_prediction_markets": ("polymarket",),
})

def get_category_for_method(method: str) -> str:
    """Get the category that contains the specified method."""
    for category, info in TOOLS_CATEGORIES.items():
        if method in info["tools"]:
            return category
    raise ValueError(f"Method '{method}' not found in any category")

def get_vendor(category: str, method: str = None) -> str:
    """Get the configured vendor for a data category or specific tool method.
    Tool-level configuration takes precedence over category-level.
    """
    config = get_config()

    # Check tool-level configuration first (if method provided)
    if method:
        tool_vendors = config.get("tool_vendors", {})
        if method in tool_vendors:
            return tool_vendors[method]

    # Fall back to category-level configuration
    return config.get("data_vendors", {}).get(category, "default")

def _vendor_chain(method: str, category: str) -> list[str]:
    if method not in VENDOR_METHODS:
        raise ValueError(f"Method '{method}' not supported")
    available = list(VENDOR_METHODS[method])
    configured = [
        vendor.strip() for vendor in get_vendor(category, method).split(",")
    ]
    explicit = [vendor for vendor in configured if vendor and vendor != "default"]
    if explicit:
        chain = [vendor for vendor in explicit if vendor in VENDOR_METHODS[method]]
        if not chain:
            raise ValueError(
                f"Configured vendor(s) {explicit} not available for '{method}'. "
                f"Available: {available}."
            )
        return chain

    if method not in DEFAULT_VENDOR_CHAINS:
        raise ValueError(f"No default vendor policy declared for '{method}'")
    chain = [
        vendor
        for vendor in DEFAULT_VENDOR_CHAINS[method]
        if vendor in VENDOR_METHODS[method]
    ]
    if not chain:
        raise ValueError(f"No default vendor is registered for '{method}'")
    return chain


_SECRET_PATTERN = re.compile(
    r"(?i)(api[_ -]?key|token|secret)(\s*[=:]\s*|\s+)([^\s,;]+)"
)


def _safe_error(error: Exception) -> str:
    return _SECRET_PATTERN.sub(r"\1=[REDACTED]", str(error))


def _no_data_message(error: NoMarketDataError) -> str:
    resolved = (
        ""
        if error.canonical == error.symbol
        else f" (resolved to '{error.canonical}')"
    )
    reason = f" ({error.detail})" if error.detail else ""
    return (
        f"NO_DATA_AVAILABLE: No usable market data for '{error.symbol}'{resolved} from "
        f"any configured vendor{reason}. The symbol may be invalid, delisted, "
        f"not covered, or the vendor returned stale data. Do not estimate or "
        f"fabricate values — report that data is unavailable for this symbol."
    )


_LEGACY_NO_NEWS_PREFIXES = {
    "get_news": "no news found",
    "get_global_news": "no global news found",
}


def _is_legacy_no_news(method: str, result: Any) -> bool:
    """Recognize only legacy news no-content strings that require fallback."""
    prefix = _LEGACY_NO_NEWS_PREFIXES.get(method)
    return bool(
        prefix
        and isinstance(result, str)
        and result.strip().lower().startswith(prefix)
    )


def _execute_route(
    method: str,
    args: tuple[Any, ...],
    kwargs: dict[str, Any],
    is_usable: Callable[[Any], bool],
) -> tuple[Any | None, str, NoMarketDataError | None, Exception | None, str | None]:
    """Execute one capability chain for string and structured entry points."""
    category = get_category_for_method(method)
    last_no_data: NoMarketDataError | None = None
    first_error: Exception | None = None
    last_no_news: str | None = None

    for vendor in _vendor_chain(method, category):
        vendor_impl = VENDOR_METHODS[method][vendor]
        impl_func = vendor_impl[0] if isinstance(vendor_impl, list) else vendor_impl
        try:
            result = impl_func(*args, **kwargs)
            if _is_legacy_no_news(method, result):
                last_no_news = result
                continue
            if is_usable(result):
                return result, category, last_no_data, first_error, last_no_news
            symbol = str(args[0]) if args else method
            last_no_data = NoMarketDataError(
                symbol, detail=f"{vendor} returned an empty or invalid result"
            )
        except VendorRateLimitError as error:
            logger.warning(
                "Vendor %r rate-limited for %s; trying next vendor.", vendor, method
            )
            if first_error is None:
                first_error = error
        except VendorNotConfiguredError as error:
            logger.debug(
                "Vendor %r not configured for %s; trying next vendor.", vendor, method
            )
            if first_error is None:
                first_error = error
        except NoMarketDataError as error:
            last_no_data = error
        except Exception as error:
            logger.warning(
                "Vendor %r failed for %s: %s",
                vendor,
                method,
                _safe_error(error),
            )
            if first_error is None:
                first_error = error
    return None, category, last_no_data, first_error, last_no_news


def _is_usable_string(result: Any) -> bool:
    if not isinstance(result, str) or not result.strip():
        return False
    return not result.lstrip().lower().startswith(
        ("error ", "error retrieving", "error fetching")
    )


def _is_usable_structured(result: Any) -> bool:
    if isinstance(result, dict):
        return bool(result)
    if not isinstance(result, ProviderResult):
        return False
    data = result.data
    if isinstance(data, pd.DataFrame):
        return not data.empty
    if isinstance(data, dict):
        return bool(data)
    return False


def route_to_vendor(method: str, *args, **kwargs) -> str:
    """Route a compatibility-string method through its explicit vendor chain."""
    result, category, last_no_data, first_error, last_no_news = _execute_route(
        method, args, kwargs, _is_usable_string
    )
    if result is not None:
        return result
    if last_no_news is not None and last_no_data is None and first_error is None:
        return last_no_news
    if last_no_data is not None:
        if first_error is not None and not isinstance(
            first_error, VendorNotConfiguredError
        ):
            logger.warning(
                "Returning NO_DATA for %s, but a vendor errored earlier: %s",
                method,
                _safe_error(first_error),
            )
        return _no_data_message(last_no_data)
    if first_error is not None:
        if category in OPTIONAL_CATEGORIES:
            safe_error = _safe_error(first_error)
            logger.warning(
                "Optional %s unavailable for %s: %s", category, method, safe_error
            )
            return (
                f"DATA_UNAVAILABLE: optional {category} could not be retrieved "
                f"({safe_error}). Proceed without it; do not fabricate values."
            )
        raise first_error
    raise RuntimeError(f"No available vendor for '{method}'")


def route_structured(
    method: str, *args, **kwargs
) -> ProviderResult[Any] | dict[str, str]:
    """Route a structured method and reject empty provider results."""
    result, _, last_no_data, first_error, _ = _execute_route(
        method, args, kwargs, _is_usable_structured
    )
    if result is not None:
        return result
    if last_no_data is not None:
        raise last_no_data
    if first_error is not None:
        raise first_error
    raise RuntimeError(f"No available vendor for '{method}'")
