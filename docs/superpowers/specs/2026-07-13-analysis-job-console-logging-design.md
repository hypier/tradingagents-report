# Analysis Job Console Logging Design

## Goal

Make server-side console logs show that an analysis job is actively being processed,
including each analysis progress event and terminal outcome.

## Scope

Logging is limited to the asynchronous API job execution path in
`application/jobs.py`. The API response schema, persisted `events` array, job state
transitions, and queue behavior remain unchanged.

## Design

After a queued job is successfully claimed, `run_job()` emits an INFO log that
identifies the job, ticker, trade date, and selected analysts. No log is emitted
when a job cannot be claimed because another worker has already processed it.

`_run_claimed_job()` emits an INFO log for every `AnalysisEvent` received from
`run_analysis()`. The log includes the job ID, ticker, progress percentage, and
event message. The same callback continues persisting progress through
`analysis_jobs.update_progress()`.

The execution path also emits INFO logs before and after report persistence and on
successful completion. Completion includes the decision and token total. Failures
continue to be persisted through `mark_failed()` and are logged at ERROR level with
the job context and traceback.

## Testing

Extend `tests/test_application_jobs.py` with focused `caplog` coverage that proves:

- a claimed job logs its processing start;
- an analysis progress callback logs its progress message;
- successful completion logs the terminal outcome;
- an analysis failure logs the job context at error level.

Tests use the existing mocks for database and graph boundaries and do not require a
database or LLM provider.
