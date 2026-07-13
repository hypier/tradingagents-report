from contextlib import contextmanager

import pytest

from tradingagents.api import service
from tradingagents.api.service import build_config


def test_build_config_rejects_request_level_backend_url():
    with pytest.raises(ValueError, match="backend_url"):
        build_config({"backend_url": "http://attacker.invalid/v1"})


def test_build_config_rejects_unsupported_checkpoint_override():
    with pytest.raises(ValueError, match="checkpoint_enabled"):
        build_config({"checkpoint_enabled": True})


def test_run_analysis_job_claims_job_inside_execution_lock(monkeypatch):
    events = []

    @contextmanager
    def execution_lock():
        events.append("lock")
        yield
        events.append("unlock")

    def claim_job(_job_id):
        events.append("claim")
        return None

    monkeypatch.setattr(service.db, "analysis_execution_lock", execution_lock, raising=False)
    monkeypatch.setattr(service.db, "claim_job", claim_job, raising=False)
    monkeypatch.setattr(
        service.db,
        "get_job",
        lambda _job_id: pytest.fail("run_analysis_job must claim instead of reading first"),
    )

    service.run_analysis_job("00000000-0000-0000-0000-000000000001")

    assert events == ["lock", "claim", "unlock"]
