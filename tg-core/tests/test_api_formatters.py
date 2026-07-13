import re
from pathlib import Path

import pytest

from api import formatters
from api.formatters import analysis_document_from_row


def test_formatter_source_contains_no_chinese_characters():
    source = Path(formatters.__file__).read_text(encoding="utf-8")

    assert re.search(r"[\u4e00-\u9fff]", source) is None


@pytest.mark.parametrize(
    "language",
    ["English", "Chinese"],
)
def test_analysis_status_label_is_not_localized_by_output_language(language):
    row = {
        "id": "00000000-0000-0000-0000-000000000001",
        "ticker": "NVDA",
        "asset_type": "stock",
        "status": "succeeded",
        "config": {"output_language": language},
    }

    document = analysis_document_from_row(row)

    assert document["status"] == "succeeded"
    assert document["status_label"] == "completed"
