# Provider-Neutral API Instruments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the analysis API accept a deterministic listing as a legacy ticker, an `EXCHANGE:SYMBOL` string, or an `instrument` object without using Yahoo-specific normalization.

**Architecture:** A provider-neutral listing module normalizes the three accepted request forms into a listing identity and emits a stable display ticker. API jobs persist that display ticker and the request identity. TradingView and Yahoo adapters each translate the same input at their own boundary; no API route performs a market search.

**Tech Stack:** Python 3.10+, FastAPI/Pydantic, pytest.

## Global Constraints

- Do not add a market-search HTTP call to the API.
- Preserve legacy ticker requests, including market-qualified tickers such as `0005.HK`.
- Reject contradictory `ticker` and `instrument` values with HTTP 422.
- Keep provider-specific conversions inside `tradingagents/dataflows/`.
- Do not create a git commit.

---

### Task 1: Introduce provider-neutral listing normalization

**Files:**
- Create: `tradingagents/dataflows/listings.py`
- Test: `tests/test_listing_symbols.py`

**Interfaces:**
- Produces `ListingRef(exchange: str | None, symbol: str, display_ticker: str)`.
- Produces `resolve_listing(ticker: str) -> ListingRef` and `listing_from_parts(exchange: str, symbol: str, display_ticker: str | None) -> ListingRef`.

- [ ] **Step 1: Write failing tests** for `0005.HK -> HKEX:5`, `HKEX:5 -> 0005.HK`, `7203.T -> TSE:7203`, `2330.TW -> TWSE:2330`, and invalid path-like input.
- [ ] **Step 2: Run the focused test** with `pytest tests/test_listing_symbols.py -v` and confirm the missing module failure.
- [ ] **Step 3: Implement the minimal listing registry** for HKEX, SSE, SZSE, TSE, TWSE, TPEX, NASDAQ, NYSE, and AMEX. Parse only deterministic suffix and explicit-exchange forms; retain legacy unqualified symbols as `exchange=None`.
- [ ] **Step 4: Run the focused test** with `pytest tests/test_listing_symbols.py -v` and confirm it passes.

### Task 2: Accept and persist the new API request contract

**Files:**
- Modify: `api/schemas.py`
- Modify: `application/jobs.py`
- Test: `tests/test_application_jobs.py`

**Interfaces:**
- `InstrumentInput` exposes `exchange`, `symbol`, and optional `display_ticker`.
- `AnalysisRequest` accepts optional `ticker` and optional `instrument`, requiring at least one.
- `CreateAnalysisJob` accepts the resolved listing and persists its display ticker plus a serializable instrument object.

- [ ] **Step 1: Write failing tests** that create jobs through each accepted form and assert the same persisted `ticker` (`0005.HK`) and request instrument metadata; add a conflicting-form test.
- [ ] **Step 2: Run** `pytest tests/test_application_jobs.py -v` and confirm the new contract tests fail.
- [ ] **Step 3: Implement Pydantic cross-field validation** and replace the `yfinance.symbols.normalize_symbol()` / `is_yahoo_safe()` call in `create_job()` with listing normalization.
- [ ] **Step 4: Run** `pytest tests/test_application_jobs.py -v` and confirm all tests pass.

### Task 3: Translate explicit listings at provider boundaries

**Files:**
- Modify: `tradingagents/dataflows/tradingview/symbols.py`
- Modify: `tradingagents/dataflows/yfinance/symbols.py`
- Test: `tests/test_tradingview_symbols.py`
- Test: `tests/test_symbol_utils.py`

**Interfaces:**
- TradingView emits the explicit exchange plus local symbol for every recognized `ListingRef`.
- Yahoo emits the listing display ticker for every recognized `ListingRef`.

- [ ] **Step 1: Write failing tests** for `0005.HK` and `HKEX:5` resolving to `HKEX:5` in TradingView and to `0005.HK` in Yahoo.
- [ ] **Step 2: Run** `pytest tests/test_tradingview_symbols.py tests/test_symbol_utils.py -v` and confirm the `HKEX:5` Yahoo test fails.
- [ ] **Step 3: Implement boundary conversion** through `resolve_listing()`, replacing the single-symbol Tencent exception with the reusable registry.
- [ ] **Step 4: Run** `pytest tests/test_tradingview_symbols.py tests/test_symbol_utils.py -v` and confirm all tests pass.

### Task 4: Verify API behavior and focused regressions

**Files:**
- Modify: `docs/API_SERVICE.md`
- Test: `tests/test_api_contract.py`

- [ ] **Step 1: Write failing FastAPI contract tests** for legacy `ticker`, explicit `ticker`, object `instrument`, and contradictory input validation without network calls.
- [ ] **Step 2: Run** `pytest tests/test_api_contract.py -v` and confirm the new tests fail.
- [ ] **Step 3: Document the three accepted identifier forms and the rule that the API never searches for a symbol.**
- [ ] **Step 4: Run** `pytest tests/test_api_contract.py tests/test_application_jobs.py tests/test_tradingview_symbols.py tests/test_symbol_utils.py -v`, `python -m py_compile api/schemas.py application/jobs.py tradingagents/dataflows/listings.py`, and `ruff check api/schemas.py application/jobs.py tradingagents/dataflows/listings.py tradingagents/dataflows/tradingview/symbols.py tradingagents/dataflows/yfinance/symbols.py`.
