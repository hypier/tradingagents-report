import pytest

from api.formatters import analysis_document_from_row


@pytest.mark.parametrize(
    ("language", "expected_label"),
    [("English", "completed"), ("Chinese", "已完成")],
)
def test_analysis_status_stays_machine_readable(language, expected_label):
    row = {
        "id": "00000000-0000-0000-0000-000000000001",
        "ticker": "NVDA",
        "asset_type": "stock",
        "status": "succeeded",
        "config": {"output_language": language},
    }

    document = analysis_document_from_row(row)

    assert document["status"] == "succeeded"
    assert document["status_label"] == expected_label
