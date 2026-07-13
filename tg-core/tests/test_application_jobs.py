from contextlib import contextmanager
from datetime import date
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID

import pytest

from application import jobs


def test_build_config_rejects_request_level_backend_url():
    with pytest.raises(ValueError, match="backend_url"):
        jobs.build_config({"backend_url": "http://attacker.invalid/v1"})


def test_build_config_rejects_unsupported_checkpoint_override():
    with pytest.raises(ValueError, match="checkpoint_enabled"):
        jobs.build_config({"checkpoint_enabled": True})


def test_run_job_claims_inside_execution_lock(monkeypatch):
    events = []

    @contextmanager
    def execution_lock():
        events.append("lock")
        yield
        events.append("unlock")

    monkeypatch.setattr(jobs.database, "analysis_execution_lock", execution_lock)
    monkeypatch.setattr(
        jobs.analysis_jobs,
        "claim_job",
        lambda job_id: events.append(("claim", job_id)) or None,
    )

    jobs.run_job("job-1")

    assert events == ["lock", ("claim", "job-1"), "unlock"]


def test_create_job_normalizes_request_and_persists_public_config(monkeypatch):
    persisted = {}
    job_id = UUID("00000000-0000-0000-0000-000000000001")

    monkeypatch.setattr(jobs, "uuid4", lambda: job_id)
    monkeypatch.setattr(
        jobs.analysis_jobs,
        "insert_job",
        lambda **kwargs: persisted.update(kwargs) or kwargs,
    )

    result = jobs.create_job(
        jobs.CreateAnalysisJob(
            ticker="btc-usd",
            trade_date=date(2026, 1, 15),
            asset_type=None,
            analysts=("market", "fundamentals", "market"),
            config_overrides={"max_debate_rounds": 2},
            output_language="Chinese",
        )
    )

    assert result["job_id"] == job_id
    assert persisted["ticker"] == "BTC-USD"
    assert persisted["asset_type"] == "crypto"
    assert persisted["analysts"] == ["market"]
    assert persisted["request"] == {
        "ticker": "BTC-USD",
        "trade_date": "2026-01-15",
        "asset_type": "crypto",
        "analysts": ["market"],
        "config_overrides": {"max_debate_rounds": 2, "output_language": "Chinese"},
        "output_language": "Chinese",
    }
    assert "results_dir" not in persisted["config"]


def test_create_job_rejects_an_invalid_ticker(monkeypatch):
    monkeypatch.setattr(jobs, "is_yahoo_safe", lambda _ticker: False)
    monkeypatch.setattr(
        jobs.analysis_jobs,
        "insert_job",
        lambda **_kwargs: pytest.fail("invalid ticker must not be persisted"),
    )

    with pytest.raises(ValueError, match="invalid ticker symbol"):
        jobs.create_job(
            jobs.CreateAnalysisJob(
                ticker="../AAPL",
                trade_date=date(2026, 1, 15),
                asset_type="stock",
                analysts=("market",),
                config_overrides={},
            )
        )


def test_run_claimed_job_records_progress_costs_and_success(monkeypatch, tmp_path):
    progress = []
    succeeded = {}
    command = {}
    row = _job_row(tmp_path)

    class Tracker:
        def summary(self):
            return {"total_tokens": 10, "by_model": {"gpt-test": {"total_tokens": 10}}}

    def fake_run_analysis(run_command, *, callbacks, on_event):
        command["value"] = run_command
        assert len(callbacks) == 1
        on_event(SimpleNamespace(progress_percent=48, message="Researching"))
        return SimpleNamespace(final_state={"final_trade_decision": "Hold"}, decision="Hold")

    monkeypatch.setattr(jobs, "TokenUsageCallback", Tracker)
    monkeypatch.setattr(jobs, "run_analysis", fake_run_analysis)
    monkeypatch.setattr(
        jobs,
        "save_api_report",
        lambda _final_state, **_kwargs: tmp_path / "complete_report.md",
    )
    monkeypatch.setattr(
        jobs.analysis_jobs,
        "update_progress",
        lambda **kwargs: progress.append(kwargs),
    )
    monkeypatch.setattr(jobs.llm_prices, "get_model_prices", lambda **_kwargs: [{"model": "gpt-test"}])
    monkeypatch.setattr(jobs, "calculate_cost", lambda usage, prices: {"total_cost_usd": 0.25})
    monkeypatch.setattr(
        jobs.analysis_jobs,
        "mark_succeeded",
        lambda **kwargs: succeeded.update(kwargs) or True,
    )

    jobs._run_claimed_job(row)

    assert command["value"].ticker == "AAPL"
    assert command["value"].analysts == ("market",)
    assert progress == [
        {"job_id": row["id"], "progress_percent": 48, "current_step": "Researching"}
    ]
    assert succeeded["decision"] == "Hold"
    assert succeeded["final_state"] == {"final_trade_decision": "Hold"}
    assert succeeded["report_path"] == str(tmp_path / "complete_report.md")
    assert succeeded["cost_breakdown"] == {"total_cost_usd": 0.25}


def test_run_claimed_job_marks_graph_failure(monkeypatch, tmp_path):
    failed = {}
    row = _job_row(tmp_path)

    class Tracker:
        def summary(self):
            return {"total_tokens": 0}

    monkeypatch.setattr(jobs, "TokenUsageCallback", Tracker)
    monkeypatch.setattr(
        jobs,
        "run_analysis",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("provider failed")),
    )
    monkeypatch.setattr(jobs.llm_prices, "get_model_prices", lambda **_kwargs: [])
    monkeypatch.setattr(jobs, "calculate_cost", lambda usage, prices: {"total_cost_usd": 0})
    monkeypatch.setattr(
        jobs.analysis_jobs,
        "mark_failed",
        lambda **kwargs: failed.update(kwargs) or True,
    )

    jobs._run_claimed_job(row)

    assert failed["error"] == "RuntimeError: provider failed"
    assert failed["token_usage"] == {"total_tokens": 0}
    assert failed["cost_breakdown"] == {"total_cost_usd": 0}


def test_run_claimed_job_marks_failed_when_pricing_lookup_also_fails(monkeypatch, tmp_path):
    failed = []
    row = _job_row(tmp_path)

    class Tracker:
        def summary(self):
            return {"total_tokens": 0}

    monkeypatch.setattr(jobs, "TokenUsageCallback", Tracker)
    monkeypatch.setattr(
        jobs,
        "run_analysis",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("analysis failed")),
    )
    monkeypatch.setattr(
        jobs.llm_prices,
        "get_model_prices",
        lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("pricing database unavailable")),
    )
    monkeypatch.setattr(
        jobs.analysis_jobs,
        "mark_failed",
        lambda **kwargs: failed.append(kwargs) or True,
    )

    jobs._run_claimed_job(row)

    assert len(failed) == 1
    assert failed[0]["error"] == "RuntimeError: analysis failed"
    assert failed[0]["cost_breakdown"] == {
        "currency": "USD",
        "total_cost": 0.0,
        "total_cost_usd": 0.0,
        "items": [],
    }


def test_run_claimed_job_marks_failed_when_successful_analysis_cannot_be_priced(
    monkeypatch, tmp_path
):
    failed = []
    row = _job_row(tmp_path)

    class Tracker:
        def summary(self):
            return {"total_tokens": 10}

    monkeypatch.setattr(jobs, "TokenUsageCallback", Tracker)
    monkeypatch.setattr(
        jobs,
        "run_analysis",
        lambda *_args, **_kwargs: SimpleNamespace(final_state={}, decision="Hold"),
    )
    monkeypatch.setattr(jobs, "save_api_report", lambda _final_state, **_kwargs: None)
    monkeypatch.setattr(
        jobs.llm_prices,
        "get_model_prices",
        lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("pricing database unavailable")),
    )
    monkeypatch.setattr(
        jobs.analysis_jobs,
        "mark_succeeded",
        lambda **_kwargs: pytest.fail("unpriced analysis must not be marked succeeded"),
    )
    monkeypatch.setattr(
        jobs.analysis_jobs,
        "mark_failed",
        lambda **kwargs: failed.append(kwargs) or True,
    )

    jobs._run_claimed_job(row)

    assert len(failed) == 1
    assert failed[0]["cost_breakdown"] == {
        "currency": "USD",
        "total_cost": 0.0,
        "total_cost_usd": 0.0,
        "items": [],
    }


def test_save_api_report_logs_os_error_and_leaves_analysis_successful(monkeypatch, caplog, tmp_path):
    monkeypatch.setattr(
        jobs,
        "write_report_tree",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(OSError("disk full")),
    )

    report_path = jobs.save_api_report(
        {},
        ticker="AAPL",
        job_id="job-1",
        results_dir=tmp_path,
    )

    assert report_path is None
    assert "job=job-1 ticker=AAPL" in caplog.text
    assert str(tmp_path / "api_reports" / "AAPL" / "job-1") in caplog.text


def test_run_claimed_job_only_warns_when_success_state_transition_conflicts(
    monkeypatch, caplog, tmp_path
):
    row = _job_row(tmp_path)

    class Tracker:
        def summary(self):
            return {"total_tokens": 0}

    monkeypatch.setattr(jobs, "TokenUsageCallback", Tracker)
    monkeypatch.setattr(
        jobs,
        "run_analysis",
        lambda *_args, **_kwargs: SimpleNamespace(final_state={}, decision="Hold"),
    )
    monkeypatch.setattr(jobs, "save_api_report", lambda _final_state, **_kwargs: None)
    monkeypatch.setattr(jobs.llm_prices, "get_model_prices", lambda **_kwargs: [])
    monkeypatch.setattr(jobs, "calculate_cost", lambda usage, prices: {"total_cost_usd": 0})
    monkeypatch.setattr(jobs.analysis_jobs, "mark_succeeded", lambda **_kwargs: False)
    monkeypatch.setattr(
        jobs.analysis_jobs,
        "mark_failed",
        lambda **_kwargs: pytest.fail("terminal conflict must not overwrite success"),
    )

    jobs._run_claimed_job(row)

    assert "left running state before success update" in caplog.text


def _job_row(results_dir: Path) -> dict:
    return {
        "id": "job-1",
        "ticker": "AAPL",
        "trade_date": date(2026, 1, 15),
        "asset_type": "stock",
        "analysts": ["market"],
        "request": {"config_overrides": {}},
        "config": {"results_dir": str(results_dir), "llm_provider": "openai"},
    }
