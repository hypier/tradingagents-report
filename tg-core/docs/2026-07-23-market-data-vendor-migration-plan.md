# Market Data Vendor Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add market-aware US and China vendor chains plus tested PandaAI, AKShare, Tushare, BaoStock, and Finnhub adapters without importing the source project's database or web stack.

**Architecture:** Keep `interface.py` as the only orchestration entry. A new market-routing helper resolves CN/US from `ListingRef`, validates environment chains, and intersects them with method capability registrations. Vendor packages translate provider symbols and responses into the existing text or `ProviderResult` contracts.

**Tech Stack:** Python 3.10+, pandas, pytest, optional provider SDKs (`akshare`, `tushare`, `baostock`, `panda_data`, `finnhub-python`).

---

Repository instructions prohibit automatic commits, so the commit steps normally required by the planning workflow are intentionally omitted.

### Task 1: Market chain configuration and routing

**Files:**
- Create: `tg-core/tradingagents/dataflows/market_routing.py`
- Modify: `tg-core/tradingagents/default_config.py`
- Modify: `tg-core/tradingagents/dataflows/interface.py`
- Test: `tg-core/tests/test_market_vendor_routing.py`
- Test: `tg-core/tests/test_env_overrides.py`

- [ ] **Step 1: Write failing configuration tests**

Add tests that reload `default_config` with `TRADINGAGENTS_CN_DATA_VENDORS` and
`TRADINGAGENTS_US_DATA_VENDORS`, assert ordered tuples, assert `disabled` becomes `None`, and assert
unknown, duplicate, cross-market, or mixed-disabled values raise `ValueError`.

- [ ] **Step 2: Run the tests and verify RED**

Run: `.\.venv\Scripts\python.exe -m pytest tests\test_env_overrides.py tests\test_market_vendor_routing.py -q`

Expected: collection/import failure because `market_routing` and the new config keys do not exist.

- [ ] **Step 3: Implement the parser and market resolver**

Implement:

```python
CN_VENDORS = frozenset({"pandaai", "akshare", "tushare", "baostock"})
US_VENDORS = frozenset({"pandaai", "tradingview", "yfinance", "alpha_vantage", "finnhub"})

def parse_market_vendor_chain(raw: str | None, market: str) -> tuple[str, ...] | None: ...
def market_for_symbol(symbol: str) -> str | None: ...
def configured_market_chain(config: Mapping[str, Any], symbol: str) -> tuple[str, ...] | None: ...
```

Use `resolve_listing()` and `country_for_exchange()`. Treat exchange-less alphabetic equity symbols as
US, but return `None` for exchange-less numeric symbols.

- [ ] **Step 4: Integrate chain precedence in `interface.py`**

Change `_vendor_chain()` to accept route arguments. Resolve explicit `tool_vendors`, then explicit
`data_vendors`, then the market chain, then `DEFAULT_VENDOR_CHAINS`. For market chains, intersect known
vendors with `VENDOR_METHODS[method]`; never append vendors outside the selected chain.

- [ ] **Step 5: Run routing tests and verify GREEN**

Run: `.\.venv\Scripts\python.exe -m pytest tests\test_env_overrides.py tests\test_market_vendor_routing.py tests\test_vendor_routing.py tests\test_application_jobs.py -q`

Expected: all selected tests pass.

### Task 2: Shared provider-neutral OHLCV helpers

**Files:**
- Create: `tg-core/tradingagents/dataflows/china/__init__.py`
- Create: `tg-core/tradingagents/dataflows/china/common.py`
- Test: `tg-core/tests/test_china_data_common.py`

- [ ] **Step 1: Write failing normalization tests**

Cover `600519.SS`, `SSE:600519`, and `000001.SZ` conversions; reject exchange-less numeric symbols;
normalize English and Chinese OHLCV columns; filter inclusive date windows; reject invalid/empty rows;
and assert CNY/provider metadata in `ProviderResult`.

- [ ] **Step 2: Run the test and verify RED**

Run: `.\.venv\Scripts\python.exe -m pytest tests\test_china_data_common.py -q`

Expected: import failure because `china.common` does not exist.

- [ ] **Step 3: Implement shared symbol and OHLCV functions**

Implement:

```python
def resolve_cn_symbol(symbol: str) -> tuple[InstrumentRef, str, str]: ...
def normalize_ohlcv(raw: pd.DataFrame, *, provider: str, requested_symbol: str,
                    resolved_symbol: str, start_date: str, end_date: str,
                    adjustment_mode: str | None = None) -> ProviderResult[pd.DataFrame]: ...
def format_stock_data(result: ProviderResult[pd.DataFrame], start_date: str, end_date: str) -> str: ...
def indicators_from_fetch(fetch: Callable[..., ProviderResult[pd.DataFrame]], ...): ...
```

Required output columns are `Date`, `Open`, `High`, `Low`, `Close`, `Volume`; `Amount` is optional.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `.\.venv\Scripts\python.exe -m pytest tests\test_china_data_common.py -q`

Expected: all tests pass.

### Task 3: PandaAI, AKShare, Tushare, and BaoStock market adapters

**Files:**
- Create: `tg-core/tradingagents/dataflows/pandaai/__init__.py`
- Create: `tg-core/tradingagents/dataflows/pandaai/market.py`
- Create: `tg-core/tradingagents/dataflows/akshare/__init__.py`
- Create: `tg-core/tradingagents/dataflows/akshare/market.py`
- Create: `tg-core/tradingagents/dataflows/tushare/__init__.py`
- Create: `tg-core/tradingagents/dataflows/tushare/market.py`
- Create: `tg-core/tradingagents/dataflows/baostock/__init__.py`
- Create: `tg-core/tradingagents/dataflows/baostock/market.py`
- Test: `tg-core/tests/test_cn_market_adapters.py`

- [ ] **Step 1: Write failing SDK-contract tests**

Use fake SDK objects. Assert PandaAI calls `get_market_data` for CN and `get_us_daily` for US; AKShare
calls `stock_zh_a_hist`; Tushare calls `pro_bar`; BaoStock logs in, calls
`query_history_k_data_plus`, consumes rows, and logs out. Assert missing optional imports/credentials map
to `VendorNotConfiguredError` and auth rejection maps to `VendorAuthenticationError`.

- [ ] **Step 2: Run tests and verify RED**

Run: `.\.venv\Scripts\python.exe -m pytest tests\test_cn_market_adapters.py -q`

Expected: import failures for the new packages.

- [ ] **Step 3: Implement minimal market adapters**

Each module exposes `fetch_<vendor>_ohlcv()`, `get_<vendor>_stock()`, and where OHLCV exists,
`get_<vendor>_indicators()`. SDK imports are lazy. Every response passes through
`china.common.normalize_ohlcv`; no adapter generates fallback or simulated data.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `.\.venv\Scripts\python.exe -m pytest tests\test_cn_market_adapters.py tests\test_china_data_common.py -q`

Expected: all tests pass.

### Task 4: A-share identity, fundamentals, statements, and news

**Files:**
- Create: `tg-core/tradingagents/dataflows/akshare/fundamentals.py`
- Create: `tg-core/tradingagents/dataflows/akshare/news.py`
- Create: `tg-core/tradingagents/dataflows/tushare/fundamentals.py`
- Create: `tg-core/tradingagents/dataflows/tushare/news.py`
- Create: `tg-core/tradingagents/dataflows/baostock/fundamentals.py`
- Test: `tg-core/tests/test_cn_vendor_capabilities.py`

- [ ] **Step 1: Write failing capability tests**

Assert provider symbol conversion, identity dictionaries, fiscal-period cutoff filtering, report text,
news inclusive-window filtering, and no-news messages. Assert BaoStock exposes identity and summary
fundamentals only, while PandaAI exposes none of these methods.

- [ ] **Step 2: Run tests and verify RED**

Run: `.\.venv\Scripts\python.exe -m pytest tests\test_cn_vendor_capabilities.py -q`

Expected: import failures for the capability modules.

- [ ] **Step 3: Implement only declared capabilities**

AKShare uses stock identity/financial abstract/report/news SDK calls. Tushare uses `stock_basic`,
`daily_basic`, `income`, `balancesheet`, `cashflow`, and `news`. BaoStock uses stock basic and financial
indicator query APIs. All report frames are filtered to `curr_date`; news is filtered with
`news_utils.in_news_window`.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `.\.venv\Scripts\python.exe -m pytest tests\test_cn_vendor_capabilities.py tests\test_news_lookahead.py -q`

Expected: all tests pass.

### Task 5: Finnhub online adapter

**Files:**
- Create: `tg-core/tradingagents/dataflows/finnhub/__init__.py`
- Create: `tg-core/tradingagents/dataflows/finnhub/client.py`
- Create: `tg-core/tradingagents/dataflows/finnhub/fundamentals.py`
- Create: `tg-core/tradingagents/dataflows/finnhub/news.py`
- Test: `tg-core/tests/test_finnhub.py`

- [ ] **Step 1: Write failing Finnhub tests**

With a fake client, assert `FINNHUB_API_KEY` is required; identity uses `company_profile2`; fundamentals
use profile and `company_basic_financials`; company/general news are filtered to the requested window;
and insider transactions exclude future rows. Assert no OHLCV method is exported.

- [ ] **Step 2: Run tests and verify RED**

Run: `.\.venv\Scripts\python.exe -m pytest tests\test_finnhub.py -q`

Expected: import failure for `tradingagents.dataflows.finnhub`.

- [ ] **Step 3: Implement Finnhub modules**

Construct the SDK client lazily from `FINNHUB_API_KEY`. Map SDK/auth/rate-limit failures to the existing
vendor exception hierarchy. Format text using current interface signatures and enforce historical date
cutoffs.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `.\.venv\Scripts\python.exe -m pytest tests\test_finnhub.py tests\test_news_lookahead.py -q`

Expected: all tests pass.

### Task 6: Registry, packaging, documentation, and full verification

**Files:**
- Modify: `tg-core/tradingagents/dataflows/interface.py`
- Modify: `tg-core/tests/test_dataflow_vendor_packages.py`
- Modify: `tg-core/pyproject.toml`
- Modify: `tg-core/README.md`
- Modify: `tg-core/tradingagents/dataflows/README.md`
- Modify: `tg-core/docs/ARCHITECTURE_DESIGN.md`
- Create: `tg-core/docs/DATA_SOURCE_CONFIGURATION.md`
- Test: `tg-core/tests/test_market_vendor_registry.py`

- [ ] **Step 1: Write failing registry tests**

Assert every declared capability is registered, unsupported capabilities are absent, the CN/US market
chains select the configured first usable vendor, and a configured chain never falls through to an
unlisted vendor.

- [ ] **Step 2: Run tests and verify RED**

Run: `.\.venv\Scripts\python.exe -m pytest tests\test_market_vendor_registry.py tests\test_dataflow_vendor_packages.py -q`

Expected: failures because registrations and package import coverage are incomplete.

- [ ] **Step 3: Register capabilities and optional dependencies**

Update `VENDOR_LIST`, `VENDOR_METHODS`, and method defaults. Add optional extras named `china-data`,
`pandaai`, `finnhub`, and aggregate `market-data`. Do not make any new SDK a mandatory dependency.

- [ ] **Step 4: Update documentation**

Document installation, environment chains, credentials, ticker formats, capability matrix, failure
semantics, source Apache-2.0 attribution, and the separate PandaAI/vendor service licensing boundary.

- [ ] **Step 5: Run focused regression tests**

Run: `.\.venv\Scripts\python.exe -m pytest tests\test_env_overrides.py tests\test_market_vendor_routing.py tests\test_china_data_common.py tests\test_cn_market_adapters.py tests\test_cn_vendor_capabilities.py tests\test_finnhub.py tests\test_market_vendor_registry.py tests\test_vendor_routing.py tests\test_vendor_errors.py tests\test_instrument_identity.py tests\test_symbol_normalization_paths.py tests\test_news_lookahead.py tests\test_market_data_validator.py tests\test_application_jobs.py tests\test_api_contract.py -q`

Expected: all tests pass.

- [ ] **Step 6: Run static and full-suite verification**

Run:

```powershell
.\.venv\Scripts\python.exe -m ruff check tradingagents\dataflows tradingagents\default_config.py tests\test_market_vendor_routing.py tests\test_china_data_common.py tests\test_cn_market_adapters.py tests\test_cn_vendor_capabilities.py tests\test_finnhub.py tests\test_market_vendor_registry.py
.\.venv\Scripts\python.exe -m pytest -q
git diff --check
```

Expected: Ruff exits 0, pytest reports zero failures, and `git diff --check` exits 0.
