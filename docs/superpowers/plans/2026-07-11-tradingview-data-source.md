# TradingView Data Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 TradingView 接入现有数据源路由并作为身份、OHLCV、技术指标、基本面、财务报表和新闻的默认一级数据源，同时移除业务层 Yahoo 直连。

**Architecture:** 新增 provider-neutral 的标的与结果契约、TradingView HTTP client 和按能力拆分的 adapter。现有 `route_to_vendor()` 继续提供字符串兼容入口，新增 `route_structured()` 为市场快照、身份和收益率提供 DataFrame/dict；所有路由使用显式 capability 默认链并只接受通过校验的结果。

**Tech Stack:** Python 3.10+、requests、pandas、stockstats、pytest、现有 TradingAgents provider router。

## Global Constraints

- 现有 Agent tool 名称、参数以及字符串/Markdown 返回格式保持兼容。
- TradingView OHLCV 每次请求必须显式发送 `type=Japanese`。
- 默认链缺少 `TRADINGVIEW_RAPIDAPI_KEY`/`RAPIDAPI_KEY` 时安静回退；key 不得进入源码、提交、异常或日志。
- 显式 provider 链是完整边界，禁止调用链外 provider。
- 不接入 TradingView TA 聚合评级、选股器、日历、流式行情或数据融合。
- Yahoo adapter 内可以继续使用 yfinance；agent、graph、validator 和通用 symbol 层不得直接依赖 yfinance。
- 每个任务严格执行 RED -> GREEN -> REFACTOR，并只提交该任务列出的文件。

---

## File Structure

- `tg-core/tradingagents/dataflows/provider_models.py`: provider-neutral `InstrumentRef`、`ProviderSymbol`、`ProviderResult`。
- `tg-core/tradingagents/dataflows/tradingview_client.py`: RapidAPI 认证、HTTP、状态码和 JSON envelope 校验。
- `tg-core/tradingagents/dataflows/tradingview_symbols.py`: TradingView 确定性 symbol 映射及搜索结果排序。
- `tg-core/tradingagents/dataflows/tradingview_stock.py`: identity、OHLCV、CSV 兼容输出和本地技术指标入口。
- `tg-core/tradingagents/dataflows/tradingview_fundamentals.py`: 基本面及三张财务报表的 TradingView 格式化。
- `tg-core/tradingagents/dataflows/tradingview_news.py`: 公司/全球新闻解析、日期过滤和兼容格式化。
- `tg-core/tradingagents/dataflows/news_utils.py`: 所有新闻 provider 共用的防前视日期窗口。
- `tg-core/tradingagents/dataflows/structured_data.py`: 供 validator、identity 和 graph 使用的结构化路由 facade。
- `tg-core/tradingagents/dataflows/interface.py`: provider 注册、显式 capability policy、字符串和结构化回退执行。
- `tg-core/tradingagents/dataflows/symbol_utils.py`: 保留 Yahoo 兼容包装，新增 provider-neutral 输入清理。
- `tg-core/tradingagents/dataflows/stockstats_utils.py`: 将 OHLCV 下载与纯指标计算分离。
- `tg-core/tradingagents/dataflows/y_finance.py`: 暴露 Yahoo 结构化 OHLCV/identity adapter 并复用共享计算器。
- `tg-core/tradingagents/default_config.py`: TradingView-first 默认链和 identity category。
- `tg-core/.env.example`: TradingView key 配置说明。
- `tg-core/tests/test_provider_models.py`: 内部契约测试。
- `tg-core/tests/test_tradingview_symbols.py`: 跨市场 symbol 测试。
- `tg-core/tests/test_tradingview_client.py`: HTTP/安全错误契约测试。
- `tg-core/tests/test_tradingview_stock.py`: identity、OHLCV、Japanese candle 和技术指标测试。
- `tg-core/tests/test_tradingview_fundamentals.py`: 基本面/报表解析测试。
- `tg-core/tests/test_tradingview_news.py`: 新闻窗口和输出测试。
- 现有 provider、validator、identity、memory、prompt 测试：回归与去 Yahoo 直连。

---

### Task 1: Provider-Neutral Contracts And Symbol Boundary

**Files:**
- Create: `tg-core/tradingagents/dataflows/provider_models.py`
- Modify: `tg-core/tradingagents/dataflows/symbol_utils.py`
- Create: `tg-core/tests/test_provider_models.py`
- Create: `tg-core/tests/test_tradingview_symbols.py`
- Create: `tg-core/tradingagents/dataflows/tradingview_symbols.py`
- Modify: `tg-core/tests/test_symbol_utils.py`

**Interfaces:**
- Produces: `parse_instrument(raw_symbol: str) -> InstrumentRef`
- Produces: `resolve_tradingview_symbol(ref: InstrumentRef, search: Callable | None = None) -> ProviderSymbol`
- Preserves: `normalize_symbol(raw: str) -> str` as Yahoo-only compatibility wrapper.

- [ ] **Step 1: Write failing contract tests**

```python
def test_parse_instrument_is_provider_neutral():
    ref = parse_instrument(" xauusd+ ")
    assert ref.raw_symbol == "xauusd+"
    assert ref.canonical_symbol == "XAUUSD"
    assert ref.asset_class == "futures"
    assert "=" not in ref.canonical_symbol

def test_provider_result_keeps_provenance_without_changing_data():
    ref = parse_instrument("AAPL")
    result = ProviderResult(
        data={"company_name": "Apple Inc."},
        provider="tradingview",
        requested=ref,
        resolved_symbol="NASDAQ:AAPL",
        as_of=datetime(2026, 7, 11, tzinfo=timezone.utc),
        provenance={"endpoint": "/api/market-data/{symbol}/company"},
    )
    assert result.data["company_name"] == "Apple Inc."
    assert result.provider == "tradingview"
```

```python
@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("NASDAQ:AAPL", "NASDAQ:AAPL"),
        ("0700.HK", "HKEX:700"),
        ("600519.SS", "SSE:600519"),
        ("BTC-USDT", "BINANCE:BTCUSDT"),
        ("EURUSD", "OANDA:EURUSD"),
        ("SPX500", "SP:SPX"),
        ("XAUUSD", "COMEX:GC1!"),
    ],
)
def test_deterministic_tradingview_symbols(raw, expected):
    assert resolve_tradingview_symbol(parse_instrument(raw)).symbol == expected

def test_search_prefers_primary_exact_listing():
    markets = [
        {"symbol": "AAPL", "type": "stock", "source_id": "PYTH", "full_name": "PYTH:AAPL"},
        {"symbol": "AAPL", "type": "stock", "source_id": "NASDAQ", "full_name": "NASDAQ:AAPL", "is_primary_listing": True},
    ]
    resolved = resolve_tradingview_symbol(parse_instrument("AAPL"), search=lambda _: markets)
    assert resolved.symbol == "NASDAQ:AAPL"
```

- [ ] **Step 2: Run tests and verify RED**

Run: `cd tg-core && .venv/bin/pytest tests/test_provider_models.py tests/test_tradingview_symbols.py -q`

Expected: collection fails because `provider_models` and `tradingview_symbols` do not exist.

- [ ] **Step 3: Implement immutable contracts and provider-neutral parsing**

Create frozen dataclasses with these exact fields:

```python
@dataclass(frozen=True)
class InstrumentRef:
    raw_symbol: str
    canonical_symbol: str
    asset_class: str
    exchange_hint: str | None = None
    currency_hint: str | None = None

@dataclass(frozen=True)
class ProviderSymbol:
    provider: str
    symbol: str
    exchange: str | None = None
    resolution_source: str = "deterministic"

T = TypeVar("T")

@dataclass(frozen=True)
class ProviderResult(Generic[T]):
    data: T
    provider: str
    requested: InstrumentRef
    resolved_symbol: str
    as_of: datetime | None = None
    delay: str | None = None
    adjustment_mode: str | None = None
    provenance: Mapping[str, Any] = field(default_factory=dict)
```

Implement `parse_instrument()` by stripping whitespace and trailing broker `+`, uppercasing, retaining an existing exchange prefix as `exchange_hint`, and classifying known crypto, forex, index and commodity aliases without adding any Yahoo/TradingView syntax.

Implement deterministic TradingView maps for the seven test cases. For bare equities, call `search(canonical_symbol)`, keep exact-symbol matches, then sort by `is_primary_listing` descending and exchange preference (`NASDAQ`, `NYSE`, `AMEX`, then other). Raise `NoMarketDataError(raw, detail="TradingView symbol could not be resolved")` when no valid `full_name`/`id` exists.

- [ ] **Step 4: Preserve and label Yahoo compatibility**

Keep every existing `normalize_symbol()` assertion passing. Update its docstring to state that it is a Yahoo resolver and ensure all new provider-neutral code imports `parse_instrument`, never `normalize_symbol`.

- [ ] **Step 5: Run tests and commit**

Run: `cd tg-core && .venv/bin/pytest tests/test_provider_models.py tests/test_tradingview_symbols.py tests/test_symbol_utils.py tests/test_cli_symbol_handling.py -q`

Expected: all selected tests pass.

```bash
git add tg-core/tradingagents/dataflows/provider_models.py tg-core/tradingagents/dataflows/symbol_utils.py tg-core/tradingagents/dataflows/tradingview_symbols.py tg-core/tests/test_provider_models.py tg-core/tests/test_tradingview_symbols.py tg-core/tests/test_symbol_utils.py
git commit -m "feat: add provider-neutral instrument contracts"
```

---

### Task 2: TradingView HTTP Client And Safe Errors

**Files:**
- Create: `tg-core/tradingagents/dataflows/tradingview_client.py`
- Modify: `tg-core/tradingagents/dataflows/errors.py`
- Create: `tg-core/tests/test_tradingview_client.py`
- Modify: `tg-core/.env.example`

**Interfaces:**
- Produces: `TradingViewClient.get(path: str, *, params: Mapping[str, Any] | None = None) -> dict[str, Any]`
- Produces: `get_tradingview_api_key() -> str`
- Produces: `VendorAuthenticationError`, `VendorUnavailableError`, both subclasses of `VendorError`.

- [ ] **Step 1: Write failing HTTP and secret-safety tests**

```python
def test_key_precedence(monkeypatch):
    monkeypatch.setenv("TRADINGVIEW_RAPIDAPI_KEY", "specific")
    monkeypatch.setenv("RAPIDAPI_KEY", "generic")
    assert get_tradingview_api_key() == "specific"

def test_missing_key_is_not_configured(monkeypatch):
    monkeypatch.delenv("TRADINGVIEW_RAPIDAPI_KEY", raising=False)
    monkeypatch.delenv("RAPIDAPI_KEY", raising=False)
    with pytest.raises(VendorNotConfiguredError):
        get_tradingview_api_key()

def test_get_sends_required_headers(monkeypatch):
    response = Mock(status_code=200)
    response.json.return_value = {"success": True, "data": {"value": 1}, "msg": "Success"}
    session = Mock()
    session.get.return_value = response
    client = TradingViewClient(api_key="secret-value", session=session)
    assert client.get("/api/test") == {"value": 1}
    headers = session.get.call_args.kwargs["headers"]
    assert headers == {"x-rapidapi-host": "tradingview-data1.p.rapidapi.com", "x-rapidapi-key": "secret-value"}

@pytest.mark.parametrize("status,error", [(401, VendorAuthenticationError), (403, VendorAuthenticationError), (429, VendorRateLimitError), (500, VendorUnavailableError)])
def test_status_mapping_does_not_leak_key(status, error):
    response = Mock(status_code=status, text="upstream failed")
    session = Mock()
    session.get.return_value = response
    client = TradingViewClient(api_key="secret-value", session=session)
    with pytest.raises(error) as caught:
        client.get("/api/test")
    assert "secret-value" not in str(caught.value)
```

- [ ] **Step 2: Verify RED**

Run: `cd tg-core && .venv/bin/pytest tests/test_tradingview_client.py -q`

Expected: import failure for `tradingview_client`.

- [ ] **Step 3: Implement the client**

Use `requests.Session.get(url, headers=headers, params=params, timeout=20)`. URL-quote only individual path symbol values before passing them into an f-string; do not quote the entire path. Return the envelope's `data`. Map missing key, 401/403, 429, other non-2xx, timeout/request exceptions, invalid JSON, `success != True`, and non-dict `data` to the exact errors exercised above. Never include headers or keys in errors/logs.

- [ ] **Step 4: Document runtime key names**

Append commented entries to `.env.example`:

```dotenv
# TradingView Data API (RapidAPI); TRADINGVIEW_RAPIDAPI_KEY takes precedence.
#TRADINGVIEW_RAPIDAPI_KEY=
#RAPIDAPI_KEY=
```

- [ ] **Step 5: Run and commit**

Run: `cd tg-core && .venv/bin/pytest tests/test_tradingview_client.py tests/test_vendor_errors.py -q`

Expected: all selected tests pass.

```bash
git add tg-core/tradingagents/dataflows/tradingview_client.py tg-core/tradingagents/dataflows/errors.py tg-core/tests/test_tradingview_client.py tg-core/.env.example
git commit -m "feat: add TradingView RapidAPI client"
```

---

### Task 3: TradingView Identity, OHLCV And Technical Indicators

**Files:**
- Create: `tg-core/tradingagents/dataflows/tradingview_stock.py`
- Modify: `tg-core/tradingagents/dataflows/stockstats_utils.py`
- Modify: `tg-core/tradingagents/dataflows/y_finance.py`
- Create: `tg-core/tests/test_tradingview_stock.py`
- Modify: `tg-core/tests/test_stockstats_date_column.py`

**Interfaces:**
- Produces: `fetch_tradingview_ohlcv(symbol: str, start_date: str, end_date: str, *, client: TradingViewClient | None = None) -> ProviderResult[pd.DataFrame]`
- Produces: `get_tradingview_stock(symbol: str, start_date: str, end_date: str) -> str`
- Produces: `get_tradingview_indicators(symbol: str, indicator: str, curr_date: str, look_back_days: int) -> str`
- Produces: `get_tradingview_identity(ticker: str) -> dict[str, str]`
- Produces: `calculate_indicator_window(data: pd.DataFrame, symbol: str, indicator: str, curr_date: str, look_back_days: int) -> str`.

- [ ] **Step 1: Write failing OHLCV tests**

```python
def test_ohlcv_explicitly_requests_japanese_candles():
    client = Mock()
    client.get.return_value = {
        "symbol": "NASDAQ:AAPL",
        "history": [
            {"time": 1783728000, "open": 100, "max": 105, "min": 99, "close": 104, "volume": 10},
            {"time": 1783641600, "open": 98, "max": 101, "min": 97, "close": 100, "volume": 9},
        ],
        "info": {"timezone": "America/New_York"},
    }
    result = fetch_tradingview_ohlcv("NASDAQ:AAPL", "2026-07-09", "2026-07-10", client=client)
    params = client.get.call_args.kwargs["params"]
    assert params["type"] == "Japanese"
    assert params["timeframe"] == "D"
    assert params["to"] == int(datetime(2026, 7, 10, 23, 59, 59, tzinfo=timezone.utc).timestamp())
    assert list(result.data.columns) == ["Date", "Open", "High", "Low", "Close", "Volume"]
    assert result.data["Date"].is_monotonic_increasing

def test_ohlcv_rejects_empty_history():
    client = Mock()
    client.get.return_value = {"symbol": "NASDAQ:AAPL", "history": []}
    with pytest.raises(NoMarketDataError):
        fetch_tradingview_ohlcv("NASDAQ:AAPL", "2026-07-09", "2026-07-10", client=client)

def test_identity_maps_company_fields():
    client = Mock()
    client.get.return_value = {
        "symbol": "NASDAQ:AAPL",
        "company": {"description": "Apple Inc.", "sector": "Technology", "industry": "Hardware", "listed_exchange": "NASDAQ"},
    }
    assert get_tradingview_identity("NASDAQ:AAPL", client=client) == {
        "company_name": "Apple Inc.", "sector": "Technology", "industry": "Hardware", "exchange": "NASDAQ", "quote_type": "stock"
    }
```

- [ ] **Step 2: Verify RED**

Run: `cd tg-core && .venv/bin/pytest tests/test_tradingview_stock.py -q`

Expected: import failure for `tradingview_stock`.

- [ ] **Step 3: Implement daily range conversion and validation**

Parse dates with `datetime.strptime`. Request `range=max(2, (end-start).days + 10)`, `to` equal to `23:59:59 UTC` on `end_date`, `timeframe="D"`, and `type="Japanese"`. Map `max -> High`, `min -> Low`; convert Unix seconds to timezone-naive UTC `Date`; sort ascending; filter inclusive `[start_date, end_date]`; reject empty rows, missing OHLC fields, non-numeric OHLC and stale data via the existing `_assert_ohlcv_not_stale()` rule.

Format `get_tradingview_stock()` with the existing three-line stock-data header and `DataFrame.to_csv(index=False)`. Include `resolved_symbol (from raw)` when resolution changes.

- [ ] **Step 4: Extract pure stockstats calculation**

Move the DataFrame-to-indicator portion of `get_stock_stats_indicators_window()` into `calculate_indicator_window(data, symbol, indicator, curr_date, look_back_days)`. Yahoo continues to call `load_ohlcv()` then this function. TradingView fetches at least `look_back_days + 250` calendar days, then calls the same function. Preserve the existing indicator descriptions and output exactly.

- [ ] **Step 5: Run and commit**

Run: `cd tg-core && .venv/bin/pytest tests/test_tradingview_stock.py tests/test_stockstats_date_column.py tests/test_yfinance_stale_ohlcv_guard.py -q`

Expected: all selected tests pass.

```bash
git add tg-core/tradingagents/dataflows/tradingview_stock.py tg-core/tradingagents/dataflows/stockstats_utils.py tg-core/tradingagents/dataflows/y_finance.py tg-core/tests/test_tradingview_stock.py tg-core/tests/test_stockstats_date_column.py
git commit -m "feat: add TradingView OHLCV and indicator adapter"
```

---

### Task 4: TradingView Fundamentals And Financial Statements

**Files:**
- Create: `tg-core/tradingagents/dataflows/tradingview_fundamentals.py`
- Create: `tg-core/tests/test_tradingview_fundamentals.py`

**Interfaces:**
- Produces: `get_tradingview_fundamentals(ticker: str, curr_date: str | None = None) -> str`
- Produces: `get_tradingview_balance_sheet(ticker: str, freq: str = "quarterly", curr_date: str | None = None) -> str`
- Produces: `get_tradingview_cashflow(ticker: str, freq: str = "quarterly", curr_date: str | None = None) -> str`
- Produces: `get_tradingview_income_statement(ticker: str, freq: str = "quarterly", curr_date: str | None = None) -> str`

- [ ] **Step 1: Write failing formatter tests**

```python
def test_fundamentals_uses_existing_labels():
    client = Mock()
    client.get.return_value = {
        "symbol": "NASDAQ:AAPL",
        "company": {"description": "Apple Inc.", "sector": "Technology", "industry": "Hardware"},
        "indicators": {"market_cap_basic": 1000, "price_earnings": 20},
        "ttm": {"earnings_per_share_diluted_ttm": 5, "total_revenue_ttm": 900, "net_income_ttm": 100},
        "current": {"current_ratio_current": 1.2},
    }
    output = get_tradingview_fundamentals("NASDAQ:AAPL", "2026-07-11", client=client)
    assert "# Company Fundamentals for NASDAQ:AAPL" in output
    assert "Name: Apple Inc." in output
    assert "Market Cap: 1000" in output
    assert "PE Ratio (TTM): 20" in output
    assert "EPS (TTM): 5" in output

def statement_client_with_periods(field, periods):
    period_ends = [epoch("2026-06-30"), epoch("2026-03-31"), epoch("2025-12-31")]
    client = Mock()

    def response(path, params=None):
        if path.endswith("financials-quarterly"):
            return {
                "symbol": "NASDAQ:AAPL",
                "financials_quarterly": {
                    f"{field}_fq": 30,
                    "fiscal_period_fq": periods[0],
                    "fiscal_period_end_fq": period_ends[0],
                },
            }
        return {
            "symbol": "NASDAQ:AAPL",
            "history_quarterly": {
                f"{field}_fq_h": [30, 20, 10],
                "fiscal_period_fq_h": periods,
                "fiscal_period_end_fq_h": period_ends,
            },
        }

    client.get.side_effect = response
    return client

@pytest.mark.parametrize(
    ("function,title,required_field"),
    [
        (get_tradingview_balance_sheet, "Balance Sheet", "total_assets"),
        (get_tradingview_cashflow, "Cash Flow", "cash_f_operating_activities"),
        (get_tradingview_income_statement, "Income Statement", "total_revenue"),
    ],
)
def test_statement_filters_fields_and_future_periods(function, title, required_field):
    client = statement_client_with_periods(required_field, ["2026-Q2", "2026-Q1", "2025-Q4"])
    output = function("NASDAQ:AAPL", "quarterly", "2026-03-31", client=client)
    assert f"# {title} data for NASDAQ:AAPL (quarterly)" in output
    assert "2026-Q1" in output
    assert "2026-Q2" not in output
```

- [ ] **Step 2: Verify RED**

Run: `cd tg-core && .venv/bin/pytest tests/test_tradingview_fundamentals.py -q`

Expected: import failure for `tradingview_fundamentals`.

- [ ] **Step 3: Implement fundamentals mapping**

Fetch `/api/market-data/{symbol}` once. Map TradingView fields to the existing labels: company `description/sector/industry`; indicators `market_cap_basic`, `price_earnings`, `price_book_ratio`, `price_52_week_high`, `price_52_week_low`; TTM `earnings_per_share_diluted_ttm`, `total_revenue_ttm`, `gross_profit_ttm`, `ebitda_ttm`, `net_income_ttm`, `net_margin_ttm`, `operating_margin_ttm`, `return_on_equity_ttm`, `return_on_assets_ttm`, `debt_to_equity_ttm`, `free_cash_flow_ttm`; current `current_ratio_current`, `book_value_per_share_current`. Omit missing values and raise `NoMarketDataError` if no mapped field exists.

- [ ] **Step 4: Implement statement tables**

For quarterly use both `financials-quarterly` and `history-quarterly`; annual uses `financials-annual` and `history-annual`. Reconstruct periods from `fiscal_period_fq/fy` and `_h` arrays, filter period ends after `curr_date`, and emit a field-by-period DataFrame as CSV. Balance sheet, cash flow and income statement each use an explicit prefix allowlist; nested exchange-rate objects are excluded. Raise `NoMarketDataError` when the filtered table is empty.

- [ ] **Step 5: Run and commit**

Run: `cd tg-core && .venv/bin/pytest tests/test_tradingview_fundamentals.py tests/test_date_boundaries.py -q`

Expected: all selected tests pass.

```bash
git add tg-core/tradingagents/dataflows/tradingview_fundamentals.py tg-core/tests/test_tradingview_fundamentals.py
git commit -m "feat: add TradingView fundamentals adapter"
```

---

### Task 5: TradingView News With Look-Ahead Protection

**Files:**
- Create: `tg-core/tradingagents/dataflows/tradingview_news.py`
- Create: `tg-core/tradingagents/dataflows/news_utils.py`
- Create: `tg-core/tests/test_tradingview_news.py`
- Modify: `tg-core/tradingagents/dataflows/yfinance_news.py`

**Interfaces:**
- Produces: `get_tradingview_news(ticker: str, start_date: str, end_date: str) -> str`
- Produces: `get_tradingview_global_news(curr_date: str, look_back_days: int | None = None, limit: int | None = None) -> str`
- Reuses: a provider-neutral `in_news_window(pub_date, start_dt, end_dt) -> bool`.

- [ ] **Step 1: Write failing news tests**

```python
def test_company_news_filters_future_and_formats_source():
    client = Mock()
    client.get.return_value = {
        "items": [
            {"title": "PAST", "published": epoch("2026-07-09"), "link": "https://past", "provider": {"name": "Reuters"}},
            {"title": "FUTURE", "published": epoch("2026-07-12"), "link": "https://future", "provider": {"name": "Reuters"}},
        ]
    }
    output = get_tradingview_news("NASDAQ:AAPL", "2026-07-08", "2026-07-10", client=client)
    assert "### PAST (source: Reuters)" in output
    assert "FUTURE" not in output

def test_global_news_uses_economic_endpoint_and_limit():
    client = Mock()
    client.get.return_value = {"items": [article("A", "2026-07-10"), article("B", "2026-07-10")]}
    output = get_tradingview_global_news("2026-07-11", look_back_days=3, limit=1, client=client)
    assert client.get.call_args.args[0] == "/api/news/economic"
    assert output.count("### ") == 1
```

- [ ] **Step 2: Verify RED**

Run: `cd tg-core && .venv/bin/pytest tests/test_tradingview_news.py -q`

Expected: import failure for `tradingview_news`.

- [ ] **Step 3: Extract shared news-window helper**

Move `_in_news_window()` into `tradingagents.dataflows.news_utils.in_news_window` or make the existing helper public in a dependency-free module. Update yfinance news to use it without changing current tests.

- [ ] **Step 4: Implement TradingView news formatting**

Company news calls `/api/news` with resolved `symbol`, `lang="en"`, and the instrument asset class as `market`. Global news calls `/api/news/economic` with `lang="en"`. Convert `published` Unix seconds to timezone-naive UTC, exclude undated articles in historical runs, filter the inclusive date window, deduplicate by `(title, published)`, apply the configured/client limit after filtering, and use `link` or `https://www.tradingview.com{storyPath}`. Preserve existing headings and no-news messages.

- [ ] **Step 5: Run and commit**

Run: `cd tg-core && .venv/bin/pytest tests/test_tradingview_news.py tests/test_news_lookahead.py tests/test_symbol_normalization_paths.py -q`

Expected: all selected tests pass.

```bash
git add tg-core/tradingagents/dataflows/tradingview_news.py tg-core/tradingagents/dataflows/news_utils.py tg-core/tradingagents/dataflows/yfinance_news.py tg-core/tests/test_tradingview_news.py tg-core/tests/test_news_lookahead.py
git commit -m "feat: add TradingView news adapter"
```

---

### Task 6: Explicit Capability Policy And Provider Registration

**Files:**
- Modify: `tg-core/tradingagents/dataflows/interface.py`
- Modify: `tg-core/tradingagents/default_config.py`
- Modify: `tg-core/tests/test_vendor_routing.py`
- Modify: `tg-core/tests/test_vendor_errors.py`
- Modify: `tg-core/tests/test_dataflows_config.py`

**Interfaces:**
- Produces: `route_structured(method: str, *args, **kwargs) -> ProviderResult[Any] | dict[str, str]`
- Preserves: `route_to_vendor(method: str, *args, **kwargs) -> str`
- Registers: `get_instrument_identity`, `get_ohlcv`, and all existing public methods.

- [ ] **Step 1: Write failing routing-policy tests**

```python
def test_default_policy_is_explicit_not_registry_order(monkeypatch):
    monkeypatch.setitem(interface.VENDOR_METHODS, "get_stock_data", {"yfinance": lambda: "YF", "tradingview": lambda: "TV"})
    monkeypatch.setitem(interface.DEFAULT_VENDOR_CHAINS, "get_stock_data", ("tradingview", "yfinance", "alpha_vantage"))
    set_config({"data_vendors": {"core_stock_apis": "default"}})
    assert interface.route_to_vendor("get_stock_data") == "TV"

def test_missing_tradingview_key_falls_back_without_warning(caplog):
    def missing():
        raise VendorNotConfiguredError("missing")
    with patch.dict(interface.VENDOR_METHODS, {"get_stock_data": {"tradingview": missing, "yfinance": lambda: "YF"}}, clear=False):
        set_config({"data_vendors": {"core_stock_apis": "tradingview,yfinance"}})
        assert interface.route_to_vendor("get_stock_data") == "YF"
    assert "not configured" not in caplog.text.lower()

def test_structured_route_rejects_empty_provider_result():
    empty = ProviderResult(pd.DataFrame(), "tradingview", parse_instrument("AAPL"), "NASDAQ:AAPL")
    good = ProviderResult(pd.DataFrame({"Close": [1]}), "yfinance", parse_instrument("AAPL"), "AAPL")
    providers = {"tradingview": lambda: empty, "yfinance": lambda: good}
    with patch.dict(interface.VENDOR_METHODS, {"get_ohlcv": providers}, clear=False), patch.dict(
        interface.DEFAULT_VENDOR_CHAINS,
        {"get_ohlcv": ("tradingview", "yfinance")},
        clear=False,
    ):
        set_config({"data_vendors": {"core_stock_apis": "default"}})
        assert interface.route_structured("get_ohlcv").provider == "yfinance"

def test_string_route_rejects_error_text_and_uses_fallback():
    providers = {"tradingview": lambda: "Error fetching data", "yfinance": lambda: "YF"}
    with patch.dict(interface.VENDOR_METHODS, {"get_stock_data": providers}, clear=False):
        set_config({"data_vendors": {"core_stock_apis": "tradingview,yfinance"}})
        assert interface.route_to_vendor("get_stock_data") == "YF"
```

- [ ] **Step 2: Verify RED**

Run: `cd tg-core && .venv/bin/pytest tests/test_vendor_routing.py tests/test_dataflows_config.py -q`

Expected: failures for missing `DEFAULT_VENDOR_CHAINS`, `route_structured`, and old Yahoo defaults.

- [ ] **Step 3: Register TradingView methods**

Add TradingView first for `get_stock_data`, `get_indicators`, `get_fundamentals`, three statements, `get_news`, and `get_global_news`. Keep insider transactions as `yfinance,alpha_vantage`. Add structured `get_ohlcv` implementations for TradingView, Yahoo and Alpha Vantage where available, and identity implementations for TradingView and Yahoo.

Define immutable `DEFAULT_VENDOR_CHAINS` per method. Parse `default` from this map, never `VENDOR_METHODS.keys()`. A configured explicit chain still filters only to registered entries and raises when none are valid.

For structured results, validate non-empty DataFrames/dicts before returning. For compatibility strings, reject empty strings and strings beginning with `Error `, `Error retrieving`, or `Error fetching`; continue to the next provider. Log missing configuration at debug; rate limits, auth, unavailable, malformed and unexpected errors at warning without credentials.

- [ ] **Step 4: Change defaults**

Set:

```python
"instrument_data": "tradingview,yfinance",
"core_stock_apis": "tradingview,yfinance,alpha_vantage",
"technical_indicators": "tradingview,yfinance,alpha_vantage",
"fundamental_data": "tradingview,yfinance,alpha_vantage",
"news_data": "tradingview,yfinance,alpha_vantage",
```

Add method-level default `get_insider_transactions: "yfinance,alpha_vantage"` so the category's TradingView-first chain does not make this method invalid.

- [ ] **Step 5: Run and commit**

Run: `cd tg-core && .venv/bin/pytest tests/test_vendor_routing.py tests/test_vendor_errors.py tests/test_dataflows_config.py tests/test_no_data_handling.py -q`

Expected: all selected tests pass.

```bash
git add tg-core/tradingagents/dataflows/interface.py tg-core/tradingagents/default_config.py tg-core/tests/test_vendor_routing.py tg-core/tests/test_vendor_errors.py tg-core/tests/test_dataflows_config.py
git commit -m "feat: make TradingView the default market data source"
```

---

### Task 7: Remove Yahoo Direct Calls From Validator And Identity

**Files:**
- Create: `tg-core/tradingagents/dataflows/structured_data.py`
- Modify: `tg-core/tradingagents/dataflows/market_data_validator.py`
- Modify: `tg-core/tradingagents/agents/utils/agent_utils.py`
- Modify: `tg-core/tests/test_market_data_validator.py`
- Modify: `tg-core/tests/test_instrument_identity.py`

**Interfaces:**
- Produces: `get_ohlcv(symbol: str, start_date: str, end_date: str) -> pd.DataFrame`
- Produces: `get_instrument_identity(ticker: str) -> dict[str, str]`
- Consumes: `route_structured("get_ohlcv", ...)` and `route_structured("get_instrument_identity", ...)`.

- [ ] **Step 1: Rewrite tests to patch provider-neutral facade**

```python
def test_verified_rows_uses_structured_ohlcv(monkeypatch):
    frame = pd.DataFrame({"Date": ["2026-07-10"], "Open": [1], "High": [2], "Low": [1], "Close": [2], "Volume": [3]})
    fetch = Mock(return_value=frame)
    monkeypatch.setattr(market_data_validator, "get_ohlcv", fetch)
    result = market_data_validator._verified_rows("AAPL", "2026-07-10")
    fetch.assert_called_once()
    assert result.iloc[-1]["Close"] == 2

def test_identity_uses_provider_router(monkeypatch):
    resolve_instrument_identity.cache_clear()
    fetch = Mock(return_value={"company_name": "Apple Inc.", "exchange": "NASDAQ"})
    monkeypatch.setattr(agent_utils, "get_instrument_identity", fetch)
    assert resolve_instrument_identity("AAPL")["company_name"] == "Apple Inc."
    fetch.assert_called_once_with("AAPL")
```

- [ ] **Step 2: Verify RED**

Run: `cd tg-core && .venv/bin/pytest tests/test_market_data_validator.py tests/test_instrument_identity.py -q`

Expected: failures because current modules still call Yahoo-specific functions.

- [ ] **Step 3: Implement structured facade and migrate consumers**

`get_ohlcv()` unwraps `ProviderResult.data`, verifies a non-empty DataFrame and returns a copy. `get_instrument_identity()` accepts either `ProviderResult[dict]` or a dict and returns a sanitized dict.

In validator, request a one-year start date ending at `curr_date`, matching current `load_ohlcv` coverage. In `agent_utils`, remove the top-level yfinance import and call the structured facade inside the existing cached fail-open wrapper. Keep `_clean_identity_value()` and returned keys unchanged.

- [ ] **Step 4: Add static regression assertion**

Add a test reading `agent_utils.py` and `market_data_validator.py` and asserting neither contains `import yfinance`, `yf.Ticker`, nor `stockstats_utils import load_ohlcv`.

- [ ] **Step 5: Run and commit**

Run: `cd tg-core && .venv/bin/pytest tests/test_market_data_validator.py tests/test_instrument_identity.py tests/test_analyst_execution.py -q`

Expected: all selected tests pass.

```bash
git add tg-core/tradingagents/dataflows/structured_data.py tg-core/tradingagents/dataflows/market_data_validator.py tg-core/tradingagents/agents/utils/agent_utils.py tg-core/tests/test_market_data_validator.py tg-core/tests/test_instrument_identity.py
git commit -m "refactor: route market validation and identity by capability"
```

---

### Task 8: Remove Yahoo Direct Calls From Return Calculation And Prompts

**Files:**
- Modify: `tg-core/tradingagents/graph/trading_graph.py`
- Modify: `tg-core/tests/test_memory_log.py`
- Modify: `tg-core/tradingagents/agents/analysts/sentiment_analyst.py`
- Modify: `tg-core/tradingagents/agents/analysts/social_media_analyst.py`
- Modify: `tg-core/tests/test_news_analyst_prompt.py`

**Interfaces:**
- Consumes: `get_ohlcv(symbol, start_date, end_date) -> pd.DataFrame`.
- Preserves: `_fetch_returns(ticker: str, trade_date: str) -> tuple[float | None, float | None, int | None]`.

- [ ] **Step 1: Rewrite return tests around structured OHLCV**

```python
import tradingagents.graph.trading_graph as trading_graph_module

def test_fetch_returns_uses_provider_neutral_ohlcv(monkeypatch):
    frames = {"NVDA": _price_df([100, 102, 104]), "SPY": _price_df([400, 401, 402])}
    fetch = Mock(side_effect=lambda symbol, start, end: frames[symbol])
    monkeypatch.setattr(trading_graph_module, "get_ohlcv", fetch)
    graph = MagicMock(spec=TradingAgentsGraph)
    graph._resolve_benchmark.return_value = "SPY"
    raw, alpha, days = TradingAgentsGraph._fetch_returns(graph, "NVDA", "2026-01-05")
    assert (round(raw, 4), round(alpha, 4), days) == (0.04, 0.035, 2)
    assert [call.args[0] for call in fetch.call_args_list] == ["NVDA", "SPY"]
```

- [ ] **Step 2: Verify RED**

Run: `cd tg-core && .venv/bin/pytest tests/test_memory_log.py -q`

Expected: rewritten tests fail because `_fetch_returns()` still calls `yf.Ticker`.

- [ ] **Step 3: Migrate return calculation**

Remove yfinance and `normalize_symbol` imports from graph. Request both target and benchmark through `get_ohlcv()` using the existing trade-date start and 30-day end. Normalize either `Date` column or DatetimeIndex, inner-align both series by date, use the common first/last rows, and return `(None, None, None)` when fewer than two common rows exist. Preserve raw return, alpha return and holding-day formulas.

- [ ] **Step 4: Make prompts provider-neutral**

Replace hardcoded “Yahoo Finance” descriptions with “configured market news providers”. Keep `get_news(ticker, start_date, end_date)` wording and tool signatures unchanged. Update prompt tests to assert the old brand string is absent.

- [ ] **Step 5: Run and commit**

Run: `cd tg-core && .venv/bin/pytest tests/test_memory_log.py tests/test_news_analyst_prompt.py tests/test_news_lookahead.py -q`

Expected: all selected tests pass.

```bash
git add tg-core/tradingagents/graph/trading_graph.py tg-core/tests/test_memory_log.py tg-core/tradingagents/agents/analysts/sentiment_analyst.py tg-core/tradingagents/agents/analysts/social_media_analyst.py tg-core/tests/test_news_analyst_prompt.py
git commit -m "refactor: remove Yahoo assumptions from graph and prompts"
```

---

### Task 9: Integration Verification, Live Contract Smoke Test And Documentation

**Files:**
- Create: `tg-core/tests/test_tradingview_live.py`
- Modify: `tg-core/README.md`
- Modify: `tg-core/docs/PROJECT_ARCHITECTURE.md`
- Modify: `docs/superpowers/plans/2026-07-11-tradingview-data-source.md` only to check completed boxes during execution.

**Interfaces:**
- Verifies all public tools and provider-neutral paths; produces no new runtime interface.

- [x] **Step 1: Add opt-in live test**

```python
@pytest.mark.integration
@pytest.mark.skipif(
    not (os.getenv("TRADINGVIEW_RAPIDAPI_KEY") or os.getenv("RAPIDAPI_KEY")),
    reason="TradingView RapidAPI key is not configured",
)
def test_live_aapl_daily_japanese_ohlcv():
    end = date.today().isoformat()
    start = (date.today() - timedelta(days=10)).isoformat()
    result = fetch_tradingview_ohlcv("NASDAQ:AAPL", start, end)
    assert not result.data.empty
    assert result.resolved_symbol == "NASDAQ:AAPL"
    assert result.adjustment_mode == "Japanese"
```

- [x] **Step 2: Document configuration and selection behavior**

README and architecture docs must state:

- key names and precedence
- default capability chains
- method-level override precedence
- explicit-chain/no-chain-outside rule
- missing-key fallback
- TradingView symbol examples and explicit Japanese candle invariant

- [x] **Step 3: Run focused suites**

Run:

```bash
cd tg-core
.venv/bin/pytest \
  tests/test_provider_models.py tests/test_tradingview_client.py \
  tests/test_tradingview_symbols.py tests/test_tradingview_stock.py \
  tests/test_tradingview_fundamentals.py tests/test_tradingview_news.py \
  tests/test_vendor_routing.py tests/test_vendor_errors.py \
  tests/test_market_data_validator.py tests/test_instrument_identity.py \
  tests/test_memory_log.py tests/test_news_lookahead.py -q
```

Expected: all selected tests pass with no external-network dependency.

- [x] **Step 4: Run full static and test verification**

Run:

```bash
cd tg-core
.venv/bin/ruff check tradingagents tests
.venv/bin/pytest -q
```

Expected: ruff exits 0 and the full suite passes.

- [x] **Step 5: Run the opt-in live test**

Read the already authorized ignored key file into only the test process environment, without printing it:

```bash
cd tg-core
TRADINGVIEW_RAPIDAPI_KEY="$(<../.agents/skills/tradingview-api-integration/.rapidapi-key)" \
  .venv/bin/pytest tests/test_tradingview_live.py -m integration -q
```

Expected: `test_live_aapl_daily_japanese_ohlcv` passes. If the external service is unavailable, report it separately; do not weaken unit contracts.

- [x] **Step 6: Verify no secret or business-layer Yahoo dependency**

Run:

```bash
git grep -nE '(TRADINGVIEW_RAPIDAPI_KEY|RAPIDAPI_KEY)=[^[:space:]]+'
rg -n "import yfinance|yf\.Ticker|stockstats_utils import load_ohlcv" \
  tg-core/tradingagents/agents tg-core/tradingagents/graph \
  tg-core/tradingagents/dataflows/market_data_validator.py
```

Expected: both commands produce no matches.

- [x] **Step 7: Commit documentation and live test**

```bash
git add tg-core/tests/test_tradingview_live.py tg-core/README.md tg-core/docs/PROJECT_ARCHITECTURE.md docs/superpowers/plans/2026-07-11-tradingview-data-source.md
git commit -m "docs: document TradingView data source policy"
```
