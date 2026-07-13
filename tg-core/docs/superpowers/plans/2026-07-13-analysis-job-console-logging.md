# Analysis Job Console Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit server-console logs for an API analysis job's start, every progress event, report persistence, and terminal outcome.

**Architecture:** Keep the log ownership in `application.jobs`, the existing orchestration boundary. The existing `run_analysis` callback persists progress unchanged, while a helper logs the same event before persistence. Claiming a queued job produces the start log only after the database transition succeeds.

**Tech Stack:** Python 3.10+, standard `logging`, pytest `caplog`.

## Global Constraints

- Keep the API response, persisted events, state transitions, and queue behavior unchanged.
- Do not add providers, dependencies, or external services.
- Preserve existing error persistence through `analysis_jobs.mark_failed()`.
- Do not create a git commit unless explicitly requested.

---

### Task 1: Log API Analysis Job Lifecycle

**Files:**
- Modify: `application/jobs.py:84-177`
- Modify: `tests/test_application_jobs.py:23-40, 182-229, 291-320`

**Interfaces:**
- Consumes: `analysis_jobs.claim_job(job_id) -> dict[str, Any] | None` and `run_analysis(..., on_event=Callable[[AnalysisEvent], None])`.
- Produces: console logs from the `application.jobs` logger without changing public function signatures.

- [ ] **Step 1: Write failing lifecycle log tests**

```python
def test_run_job_logs_when_a_queued_job_starts(monkeypatch, caplog):
    row = {"id": "job-1", "ticker": "AAPL", "trade_date": date(2026, 1, 15), "analysts": ["market"]}
    monkeypatch.setattr(jobs.database, "analysis_execution_lock", nullcontext)
    monkeypatch.setattr(jobs.analysis_jobs, "claim_job", lambda _job_id: row)
    monkeypatch.setattr(jobs, "_run_claimed_job", lambda _row: None)

    jobs.run_job("job-1")

    assert "Starting analysis job=job-1 ticker=AAPL" in caplog.text
```

Add focused `caplog` assertions to the existing success and graph-failure tests:

```python
assert "Analysis progress job=job-1 ticker=AAPL progress=48% step=Researching" in caplog.text
assert "Analysis job completed job=job-1 ticker=AAPL decision=Hold tokens=10" in caplog.text
assert "Analysis job failed job=job-1 ticker=AAPL" in caplog.text
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_application_jobs.py -k 'logs_when_a_queued_job_starts or records_progress_costs_and_success or marks_graph_failure' -v`

Expected: FAIL because the requested lifecycle log messages are absent.

- [ ] **Step 3: Add minimal lifecycle logging**

In `run_job()`, after `claim_job()` returns a row, log the job ID, ticker, ISO date, and comma-separated analysts before calling `_run_claimed_job(row)`.

In `_run_claimed_job()`, replace the inline progress lambda with a callback that logs each event then calls:

```python
analysis_jobs.update_progress(
    job_id=row["id"],
    progress_percent=event.progress_percent,
    current_step=event.message,
)
```

Log report persistence before `save_api_report()` and its returned path after the call. Log the completed decision and `usage["total_tokens"]` after a successful `mark_succeeded()` transition. In the exception handler, use `logger.exception()` with job ID and ticker before calling `mark_failed()`.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `pytest tests/test_application_jobs.py -k 'logs_when_a_queued_job_starts or records_progress_costs_and_success or marks_graph_failure' -v`

Expected: PASS.

- [ ] **Step 5: Run scope validation**

Run: `pytest tests/test_application_jobs.py && ruff check application/jobs.py tests/test_application_jobs.py && python -m py_compile application/jobs.py`

Expected: all tests pass, Ruff reports no violations, and compilation exits with status 0.
