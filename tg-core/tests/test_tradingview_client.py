"""Tests for the TradingView RapidAPI HTTP boundary."""

from unittest.mock import Mock

import pytest
import requests

from tradingagents.dataflows.errors import (
    VendorAuthenticationError,
    VendorNotConfiguredError,
    VendorRateLimitError,
    VendorUnavailableError,
)
from tradingagents.dataflows.tradingview.client import (
    TradingViewClient,
    get_tradingview_api_key,
)


def test_key_precedence(monkeypatch):
    monkeypatch.setenv("TRADINGVIEW_RAPIDAPI_KEY", "specific")
    monkeypatch.setenv("RAPIDAPI_KEY", "generic")

    assert get_tradingview_api_key() == "specific"


def test_generic_key_is_used_as_fallback(monkeypatch):
    monkeypatch.delenv("TRADINGVIEW_RAPIDAPI_KEY", raising=False)
    monkeypatch.setenv("RAPIDAPI_KEY", "generic")

    assert get_tradingview_api_key() == "generic"


def test_missing_key_is_not_configured(monkeypatch):
    monkeypatch.delenv("TRADINGVIEW_RAPIDAPI_KEY", raising=False)
    monkeypatch.delenv("RAPIDAPI_KEY", raising=False)

    with pytest.raises(VendorNotConfiguredError):
        get_tradingview_api_key()


def test_get_sends_required_headers():
    response = Mock(status_code=200)
    response.json.return_value = {
        "success": True,
        "data": {"value": 1},
        "msg": "Success",
    }
    session = Mock()
    session.get.return_value = response
    client = TradingViewClient(api_key="secret-value", session=session)

    assert client.get("/api/test", params={"language": "en"}) == {"value": 1}
    session.get.assert_called_once_with(
        "https://tradingview-data1.p.rapidapi.com/api/test",
        headers={
            "x-rapidapi-host": "tradingview-data1.p.rapidapi.com",
            "x-rapidapi-key": "secret-value",
        },
        params={"language": "en"},
        timeout=30,
    )


def test_get_retries_timeout_and_returns_later_success():
    response = Mock(status_code=200)
    response.json.return_value = {
        "success": True,
        "data": {"value": 1},
    }
    session = Mock()
    session.get.side_effect = [requests.Timeout("timed out"), response]
    client = TradingViewClient(api_key="secret-value", session=session)

    assert client.get("/api/test") == {"value": 1}
    assert session.get.call_count == 2


def test_get_stops_after_three_transport_failures():
    session = Mock()
    session.get.side_effect = requests.Timeout("timed out")
    client = TradingViewClient(api_key="secret-value", session=session)

    with pytest.raises(VendorUnavailableError):
        client.get("/api/test")

    assert session.get.call_count == 3


@pytest.mark.parametrize(
    ("status", "error"),
    [
        (401, VendorAuthenticationError),
        (403, VendorAuthenticationError),
        (429, VendorRateLimitError),
        (500, VendorUnavailableError),
    ],
)
def test_status_mapping_does_not_leak_key(status, error):
    response = Mock(status_code=status, text="upstream failed")
    session = Mock()
    session.get.return_value = response
    client = TradingViewClient(api_key="secret-value", session=session)

    with pytest.raises(error) as caught:
        client.get("/api/test")

    assert "secret-value" not in str(caught.value)


def test_client_error_repr_does_not_leak_key():
    response = Mock(status_code=401)
    session = Mock()
    session.get.return_value = response
    client = TradingViewClient(api_key="secret-value", session=session)

    with pytest.raises(VendorAuthenticationError) as caught:
        client.get("/api/test")

    assert "secret-value" not in repr(caught.value)


@pytest.mark.parametrize(
    "exception",
    [requests.Timeout("timed out"), requests.RequestException("request failed")],
)
def test_transport_errors_are_unavailable_and_do_not_leak_key(exception):
    session = Mock()
    session.get.side_effect = exception
    client = TradingViewClient(api_key="secret-value", session=session)

    with pytest.raises(VendorUnavailableError) as caught:
        client.get("/api/test")

    assert "secret-value" not in str(caught.value)


def test_invalid_json_is_unavailable():
    response = Mock(status_code=200)
    response.json.side_effect = requests.exceptions.JSONDecodeError("bad", "", 0)
    session = Mock()
    session.get.return_value = response

    with pytest.raises(VendorUnavailableError):
        TradingViewClient(api_key="secret-value", session=session).get("/api/test")


@pytest.mark.parametrize(
    "payload",
    [
        {"success": False, "data": {}, "msg": "failed"},
        {"success": True, "data": []},
        ["not", "an", "envelope"],
    ],
)
def test_invalid_envelope_is_unavailable(payload):
    response = Mock(status_code=200)
    response.json.return_value = payload
    session = Mock()
    session.get.return_value = response

    with pytest.raises(VendorUnavailableError):
        TradingViewClient(api_key="secret-value", session=session).get("/api/test")


def test_client_reads_key_from_environment_when_not_supplied(monkeypatch):
    monkeypatch.setenv("TRADINGVIEW_RAPIDAPI_KEY", "secret-value")
    session = Mock()
    session.get.return_value = Mock(
        status_code=200,
        json=Mock(return_value={"success": True, "data": {}}),
    )

    assert TradingViewClient(session=session).get("/api/test") == {}
