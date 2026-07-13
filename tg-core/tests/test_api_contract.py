from uuid import UUID

import pytest
from pydantic import ValidationError

from api.schemas import AnalysisRequest


@pytest.mark.parametrize(
    "identifier",
    [
        {"ticker": "0005.HK"},
        {"ticker": "HKEX:5"},
        {
            "instrument": {
                "exchange": "HKEX",
                "symbol": "5",
                "display_ticker": "0005.HK",
            }
        },
    ],
)
def test_analysis_request_accepts_each_deterministic_listing_form(identifier):
    request = AnalysisRequest.model_validate({**identifier, "trade_date": "2026-01-15"})

    assert request.trade_date.isoformat() == "2026-01-15"


def test_analysis_request_rejects_conflicting_listing_forms():
    with pytest.raises(ValidationError, match="does not match instrument"):
        AnalysisRequest.model_validate(
            {
                "ticker": "0700.HK",
                "instrument": {"exchange": "HKEX", "symbol": "5"},
                "trade_date": "2026-01-15",
            }
        )


def test_analysis_request_requires_a_listing_form():
    with pytest.raises(ValidationError, match="ticker or instrument is required"):
        AnalysisRequest.model_validate({"trade_date": "2026-01-15"})


def test_analysis_request_accepts_client_request_id():
    request = AnalysisRequest.model_validate(
        {
            "ticker": "0700.HK",
            "request_id": "00000000-0000-0000-0000-000000000010",
            "trade_date": "2026-01-15",
        }
    )

    assert request.request_id == UUID("00000000-0000-0000-0000-000000000010")
