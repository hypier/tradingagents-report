import re
from pathlib import Path

import pytest

from api import formatters
from api.formatters import analysis_result_from_row


def test_analysis_result_exposes_exchange_display_and_language():
    document = analysis_result_from_row(
        {
            "id": "00000000-0000-0000-0000-000000000002",
            "ticker": "0700.HK",
            "exchange": "HKEX",
            "trade_date": "2026-01-15",
            "asset_type": "stock",
            "status": "succeeded",
            "analysts": ["market"],
            "display": {
                "display_name": "Tencent Holdings Ltd.",
                "logo_url": "https://example.test/tencent.svg",
            },
            "request": {"output_language": "Chinese"},
            "config": {"output_language": "Chinese"},
            "final_state": {"final_trade_decision": "Buy"},
        }
    )

    assert document["exchange"] == "HKEX"
    assert document["display"] == {
        "display_name": "Tencent Holdings Ltd.",
        "logo_url": "https://example.test/tencent.svg",
        "country": "HK",
    }
    assert document["output_language"] == "Chinese"


def test_formatter_source_contains_no_chinese_characters():
    source = Path(formatters.__file__).read_text(encoding="utf-8")

    assert re.search(r"[\u4e00-\u9fff]", source) is None


@pytest.mark.parametrize(
    "language",
    ["English", "Chinese"],
)
def test_analysis_result_uses_single_canonical_fields(language):
    row = {
        "id": "00000000-0000-0000-0000-000000000001",
        "ticker": "NVDA",
        "trade_date": "2026-01-15",
        "asset_type": "stock",
        "status": "succeeded",
        "analysts": ["market"],
        "config": {"output_language": language},
        "final_state": {"final_trade_decision": "Overweight"},
        "token_usage": {"total_tokens": 42},
        "cost_usd": 0.12,
        "cost_breakdown": {"total_cost_usd": 0.12},
        "events": [{"message": "must not be included"}],
    }

    document = analysis_result_from_row(row)

    assert set(document) == {
        "id", "request_id", "ticker", "exchange", "trade_date", "asset_type", "analysts", "status",
        "progress", "decision", "reports", "usage", "cost", "display", "output_language", "error",
        "created_at", "updated_at", "started_at", "finished_at",
    }
    assert document["status"] == "succeeded"
    assert document["decision"]["action"] == "Overweight"
    assert document["usage"] == {"tokens": 42, "token_usage": {"total_tokens": 42}}
    assert document["cost"] == {"usd": 0.12, "breakdown": {"total_cost_usd": 0.12}}
    assert document["display"] == {}
    assert document["output_language"] == language
    assert document["exchange"] is None
    assert "events" not in document
