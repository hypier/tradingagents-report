"""Secret-safe HTTP client for the TradingView Data API on RapidAPI."""

from __future__ import annotations

import os
from collections.abc import Mapping
from typing import Any

import requests

from tradingagents.dataflows.errors import (
    VendorAuthenticationError,
    VendorNotConfiguredError,
    VendorRateLimitError,
    VendorUnavailableError,
)

_API_HOST = "tradingview-data1.p.rapidapi.com"
_BASE_URL = f"https://{_API_HOST}"
_TIMEOUT_SECONDS = 20


def get_tradingview_api_key() -> str:
    """Return the configured RapidAPI key, preferring the vendor-specific name."""
    api_key = os.getenv("TRADINGVIEW_RAPIDAPI_KEY") or os.getenv("RAPIDAPI_KEY")
    if not api_key:
        raise VendorNotConfiguredError("TradingView Data API is not configured")
    return api_key


class TradingViewClient:
    """Perform authenticated requests and validate TradingView response envelopes."""

    def __init__(
        self,
        api_key: str | None = None,
        session: requests.Session | None = None,
    ) -> None:
        self._api_key = api_key if api_key is not None else get_tradingview_api_key()
        self._session = session if session is not None else requests.Session()

    def get(
        self,
        path: str,
        *,
        params: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        """GET one API path and return the validated response envelope's data."""
        headers = {
            "x-rapidapi-host": _API_HOST,
            "x-rapidapi-key": self._api_key,
        }
        url = f"{_BASE_URL}/{path.lstrip('/')}"

        try:
            response = self._session.get(
                url,
                headers=headers,
                params=params,
                timeout=_TIMEOUT_SECONDS,
            )
        except requests.RequestException:
            raise VendorUnavailableError("TradingView Data API request failed") from None

        if response.status_code in (401, 403):
            raise VendorAuthenticationError(
                "TradingView Data API rejected the configured credentials"
            )
        if response.status_code == 429:
            raise VendorRateLimitError("TradingView Data API rate limit exceeded")
        if not 200 <= response.status_code < 300:
            raise VendorUnavailableError("TradingView Data API is unavailable")

        try:
            payload = response.json()
        except (TypeError, ValueError):
            raise VendorUnavailableError(
                "TradingView Data API returned invalid JSON"
            ) from None

        if not isinstance(payload, dict) or payload.get("success") is not True:
            raise VendorUnavailableError(
                "TradingView Data API returned an unsuccessful response"
            )
        data = payload.get("data")
        if not isinstance(data, dict):
            raise VendorUnavailableError(
                "TradingView Data API returned invalid response data"
            )
        return data
