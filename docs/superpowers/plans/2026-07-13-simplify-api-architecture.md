# TradingAgents 接口与基础服务解耦实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 将 HTTP API 提升到与 CLI 同级，建立 CLI/API 共用的分析执行流程，并把数据库、LLM token usage 和定价能力移出 API 层。

**架构：** 顶层 `api/` 和 `cli/` 只负责输入输出，顶层 `application/` 编排分析与持久化任务，`tradingagents/` 保留核心投研能力，顶层 `infrastructure/` 提供直接的 PostgreSQL 函数。保持函数式调用，不引入 ports、Repository class、ORM、依赖注入容器或外部任务队列。

**技术栈：** Python 3.10+、LangGraph、LangChain callbacks、FastAPI、Typer/Rich、psycopg 3、pytest、Ruff。

## 全局约束

- HTTP URL、请求字段、响应字段、API key 规则、任务状态和报告内容保持不变。
- CLI 命令名 `tradingagents` 和 `TradingAgentsGraph` 程序化入口保持可用。
- 新项目不保留 `tradingagents.api.*` import 路径或旧 Uvicorn 入口。
- 单 worker 串行执行和 PostgreSQL advisory lock 行为保持不变。
- 不改变 LangGraph 节点、边、Agent prompt、数据供应商路由或真实交易边界。
- 不引入 Celery、Dramatiq、Redis Queue、ORM、Alembic 或抽象 Repository 接口。
- 手工编辑使用 `apply_patch`；每个任务只提交相关文件。

---

## 文件结构锁定

本计划完成后，相关文件职责如下：

```text
tg-core/
├── api/
│   ├── __init__.py          # HTTP 包标识
│   ├── app.py               # FastAPI 路由与 lifespan
│   ├── formatters.py        # HTTP/附件 JSON 格式
│   ├── job_worker.py        # API 进程内单 worker 线程
│   ├── schemas.py           # HTTP Pydantic 模型
│   └── security.py          # X-API-Key 校验
├── application/
│   ├── __init__.py
│   ├── analysis.py          # CLI/API 共用分析执行用例
│   ├── jobs.py              # 持久化 Job 创建和执行
│   ├── pricing.py           # 价格刷新与费用回填编排
│   └── progress.py          # Graph 状态到进度事件
├── infrastructure/
│   ├── __init__.py
│   ├── database.py          # 连接、建表、healthcheck、advisory lock
│   ├── analysis_jobs.py     # analysis_jobs SQL
│   └── llm_prices.py        # LLM 价格表与来源状态 SQL
├── cli/
│   └── main.py              # CLI 输入与 Rich 展示
└── tradingagents/
    ├── graph/trading_graph.py
    └── llm_clients/
        ├── pricing.py       # 价格源获取、解析和纯费用计算
        └── token_usage.py   # 统一 LLM/tool usage callback
```

---

### Task 1: 统一 LLM usage 与定价模块

**文件：**

- 创建：`tg-core/tradingagents/llm_clients/token_usage.py`
- 创建：`tg-core/tradingagents/llm_clients/pricing.py`
- 修改：`tg-core/cli/main.py:21-23,997-1012`
- 删除：`tg-core/cli/stats_handler.py`
- 测试：`tg-core/tests/test_llm_token_usage.py`
- 测试：`tg-core/tests/test_llm_pricing.py`

**接口：**

- 产出：`TokenUsageCallback.summary() -> dict[str, Any]`
- 产出：`TokenUsageCallback.get_stats() -> dict[str, int]`，供现有 Rich footer 使用
- 产出：`calculate_cost(token_usage, price_rows) -> dict[str, Any]`
- 产出：`fetch_price_rows(source_urls=None) -> tuple[list[dict], list[dict]]`
- 后续任务通过 `tradingagents.llm_clients.token_usage` 和
  `tradingagents.llm_clients.pricing` 导入这些能力。

- [ ] **步骤 1：为统一 callback 写失败测试**

在 `tests/test_llm_token_usage.py` 写入：

```python
from types import SimpleNamespace

from tradingagents.llm_clients.token_usage import TokenUsageCallback


def test_usage_callback_exposes_api_summary_and_cli_stats():
    message = SimpleNamespace(
        usage_metadata={"input_tokens": 12, "output_tokens": 5, "total_tokens": 17},
        response_metadata={"model_name": "gpt-test"},
    )
    response = SimpleNamespace(
        generations=[[SimpleNamespace(message=message)]],
        llm_output={},
    )
    callback = TokenUsageCallback()

    callback.on_llm_end(response)
    callback.on_tool_start({"name": "get_stock_data"}, "AAPL")

    assert callback.summary()["by_model"]["gpt-test"]["total_tokens"] == 17
    assert callback.get_stats() == {
        "llm_calls": 1,
        "tool_calls": 1,
        "tokens_in": 12,
        "tokens_out": 5,
    }
```

- [ ] **步骤 2：运行测试并确认因新模块不存在而失败**

运行：

```bash
cd tg-core
uv run --extra dev pytest tests/test_llm_token_usage.py -q
```

预期：测试收集阶段报 `ModuleNotFoundError: tradingagents.llm_clients.token_usage`。

- [ ] **步骤 3：移动现有 usage 逻辑并合并 CLI 统计接口**

以当前 `tradingagents/api/token_usage.py` 为基础创建新模块，并增加线程锁、tool call
统计和 CLI 兼容读取接口：

```python
class TokenUsageCallback(BaseCallbackHandler):
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.calls = 0
        self.tool_calls = 0
        self.prompt_tokens = 0
        self.completion_tokens = 0
        self.reasoning_tokens = 0
        self.cache_read_input_tokens = 0
        self.cache_creation_input_tokens = 0
        self.total_tokens = 0
        self.by_model = defaultdict(new_counter)

    def on_llm_end(self, response: Any, **kwargs: Any) -> None:
        usage_items = list(extract_usage_items(response))
        if not usage_items:
            return
        with self._lock:
            self.calls += 1
            for usage, model_name in usage_items:
                self._add_usage(normalize_usage(usage), model_name)

    def on_tool_start(self, serialized: dict[str, Any], input_str: str, **kwargs: Any) -> None:
        with self._lock:
            self.tool_calls += 1

    def get_stats(self) -> dict[str, int]:
        summary = self.summary()
        return {
            "llm_calls": summary["calls"],
            "tool_calls": summary["tool_calls"],
            "tokens_in": summary["prompt_tokens"],
            "tokens_out": summary["completion_tokens"],
        }
```

`summary()` 必须在锁内复制计数，并继续返回现有 API 使用的字段，同时增加
`tool_calls`。

- [ ] **步骤 4：移动纯 pricing 模块并增加定价回归测试**

将 `tradingagents/api/pricing.py` 原样迁移到
`tradingagents/llm_clients/pricing.py`，在 `tests/test_llm_pricing.py` 写入：

```python
from decimal import Decimal

from tradingagents.llm_clients.pricing import calculate_cost


def test_calculate_cost_separates_cached_and_uncached_input():
    prices = [{
        "provider": "openai",
        "model": "gpt-test",
        "unit_tokens": 1_000_000,
        "input_price": Decimal("10"),
        "cached_input_price": Decimal("1"),
        "cache_write_price": None,
        "output_price": Decimal("20"),
        "billing_mode": "standard",
        "context_tier": "short",
        "currency": "USD",
    }]
    usage = {
        "model": "gpt-test",
        "prompt_tokens": 1000,
        "cache_read_input_tokens": 400,
        "completion_tokens": 200,
        "total_tokens": 1200,
    }

    result = calculate_cost(usage, prices)

    assert result["total_cost_usd"] == 0.0104
    assert result["items"][0]["uncached_input_tokens"] == 600
```

- [ ] **步骤 5：切换 CLI 导入并删除重复 callback**

在 `cli/main.py` 使用：

```python
from tradingagents.llm_clients.token_usage import TokenUsageCallback
```

将 `StatsCallbackHandler()` 替换为 `TokenUsageCallback()`，保留变量名
`stats_handler` 以限制 UI diff。删除 `cli/stats_handler.py`。

- [ ] **步骤 6：运行 usage、pricing 和 CLI 配置测试**

运行：

```bash
cd tg-core
uv run --extra dev pytest \
  tests/test_llm_token_usage.py \
  tests/test_llm_pricing.py \
  tests/test_cli_config_precedence.py -q
```

预期：全部通过。

- [ ] **步骤 7：提交任务 1**

```bash
git add tg-core/tradingagents/llm_clients/token_usage.py \
  tg-core/tradingagents/llm_clients/pricing.py \
  tg-core/cli/main.py \
  tg-core/cli/stats_handler.py \
  tg-core/tests/test_llm_token_usage.py \
  tg-core/tests/test_llm_pricing.py
git commit -m "refactor: centralize LLM usage and pricing"
```

---

### Task 2: 建立共享分析执行与进度事件

**文件：**

- 创建：`tg-core/application/__init__.py`
- 创建：`tg-core/application/analysis.py`
- 创建：`tg-core/application/progress.py`
- 修改：`tg-core/tradingagents/graph/trading_graph.py:381-501`
- 测试：`tg-core/tests/test_application_analysis.py`
- 测试：`tg-core/tests/test_application_progress.py`

**接口：**

- `AnalysisCommand(ticker, trade_date, asset_type, analysts, config)`
- `AnalysisEvent(progress_percent, message, state_update)`
- `AnalysisResult(final_state, decision)`
- `run_analysis(command, callbacks=(), on_event=None) -> AnalysisResult`
- `TradingAgentsGraph.propagate(company_name, trade_date, asset_type="stock", on_chunk=None)`
  保持原返回值不变。

- [ ] **步骤 1：为进度推导写失败测试**

在 `tests/test_application_progress.py` 写入：

```python
from application.progress import estimate_progress


def test_progress_moves_from_analysts_to_research_debate():
    state = {"market_report": "done", "news_report": "done"}
    progress, message = estimate_progress(
        state,
        analysts=("market", "news"),
        config={"max_debate_rounds": 1, "max_risk_discuss_rounds": 1},
    )
    assert progress == 50
    assert message == "Running research debate (0/2)"


def test_progress_finishes_at_portfolio_manager():
    state = {
        "market_report": "done",
        "investment_debate_state": {"judge_decision": "research"},
        "trader_investment_plan": "plan",
        "risk_debate_state": {"judge_decision": "risk"},
    }
    assert estimate_progress(
        state,
        analysts=("market",),
        config={"max_debate_rounds": 1, "max_risk_discuss_rounds": 1},
    ) == (92, "Portfolio Manager completed")
```

- [ ] **步骤 2：运行测试并确认新 application 包不存在**

```bash
cd tg-core
uv run --extra dev pytest tests/test_application_progress.py -q
```

预期：`ModuleNotFoundError: application`。

- [ ] **步骤 3：移动进度算法**

将当前 `api/service.py` 的 `ANALYST_REPORT_KEYS` 和 `estimate_progress()` 移到
`application/progress.py`，签名固定为：

```python
def estimate_progress(
    state: dict[str, Any],
    analysts: tuple[str, ...] | list[str],
    config: dict[str, Any],
) -> tuple[int, str]:
    selected = [analyst for analyst in analysts if analyst in ANALYST_REPORT_KEYS]
    if selected:
        per_analyst = 40 / len(selected)
        completed = 0
        current_label = "Running analyst team"
        for analyst in selected:
            report_key, label = ANALYST_REPORT_KEYS[analyst]
            if state.get(report_key):
                completed += 1
                current_label = label
                continue
            current_label = f"Running {label.removesuffix(' completed')}"
            break
        if completed < len(selected):
            return int(10 + completed * per_analyst), current_label

    investment_state = state.get("investment_debate_state") or {}
    if not investment_state.get("judge_decision"):
        max_debate = max(1, int(config.get("max_debate_rounds") or 1) * 2)
        count = min(max_debate, int(investment_state.get("count") or 0))
        return 50 + int((count / max_debate) * 12), f"Running research debate ({count}/{max_debate})"

    if not state.get("trader_investment_plan"):
        return 66, "Running Trader"

    risk_state = state.get("risk_debate_state") or {}
    if not risk_state.get("judge_decision"):
        max_risk = max(1, int(config.get("max_risk_discuss_rounds") or 1) * 3)
        count = min(max_risk, int(risk_state.get("count") or 0))
        return 72 + int((count / max_risk) * 16), f"Running risk debate ({count}/{max_risk})"

    return 92, "Portfolio Manager completed"
```

保持当前百分比区间和英文 message 不变。

- [ ] **步骤 4：为 Graph chunk callback 写失败测试**

在 `tests/test_application_analysis.py` 写一个轻量 Graph stub，并验证应用层不直接访问
`graph.graph`：

```python
from application import analysis
from application.analysis import AnalysisCommand, AnalysisEvent


class StubGraph:
    def __init__(self, selected_analysts, config, debug, callbacks):
        self.config = config

    def propagate(self, ticker, trade_date, asset_type="stock", on_chunk=None):
        on_chunk({"market_report": "market"})
        on_chunk({
            "investment_debate_state": {"judge_decision": "research"},
            "trader_investment_plan": "plan",
            "risk_debate_state": {"judge_decision": "risk"},
            "final_trade_decision": "Hold",
        })
        return {"market_report": "market", "final_trade_decision": "Hold"}, "Hold"


def test_run_analysis_emits_events_and_returns_result(monkeypatch):
    monkeypatch.setattr(analysis, "TradingAgentsGraph", StubGraph)
    events: list[AnalysisEvent] = []
    command = AnalysisCommand(
        ticker="AAPL",
        trade_date="2026-01-15",
        asset_type="stock",
        analysts=("market",),
        config={"max_debate_rounds": 1, "max_risk_discuss_rounds": 1},
    )

    result = analysis.run_analysis(command, on_event=events.append)

    assert result.decision == "Hold"
    assert events[-1].progress_percent == 92
    assert events[-1].state_update["final_trade_decision"] == "Hold"
```

- [ ] **步骤 5：给 TradingAgentsGraph 增加公开 chunk callback**

修改 `propagate()` 和 `_run_graph()`：

```python
def propagate(
    self,
    company_name,
    trade_date,
    asset_type: str = "stock",
    on_chunk=None,
):
```

并将现有 `try` 块中的调用替换为：

```python
return self._run_graph(
    company_name,
    trade_date,
    asset_type=asset_type,
    on_chunk=on_chunk,
)
```

同时将 `_run_graph` 签名替换为：

```python
def _run_graph(self, company_name, trade_date, asset_type: str = "stock", on_chunk=None):
```

保留初始 state 的现有构造代码，将当前 `args` 构造、checkpoint thread ID 注入和
debug/invoke 分支整体替换为：

```python
args = self.propagator.get_graph_args(callbacks=self.callbacks)
if self.config.get("checkpoint_enabled"):
    tid = thread_id(company_name, str(trade_date), self._run_signature(asset_type))
    args.setdefault("config", {}).setdefault("configurable", {})["thread_id"] = tid

final_state = {}
last_printed = None
for chunk in self.graph.stream(init_agent_state, **args):
    final_state.update(chunk)
    if on_chunk is not None:
        on_chunk(chunk)
    if self.debug and chunk.get("messages"):
        message = chunk["messages"][-1]
        signature = (type(message).__name__, getattr(message, "content", None))
        if signature != last_printed:
            message.pretty_print()
            last_printed = signature
```

成功后的 state log、decision memory、checkpoint 清理和返回值继续由
`TradingAgentsGraph` 完成。这样 CLI/API 不再复制这些内部步骤。

- [ ] **步骤 6：实现 application 数据类和共享执行函数**

在 `application/analysis.py` 写入：

```python
@dataclass(frozen=True)
class AnalysisCommand:
    ticker: str
    trade_date: str
    asset_type: str
    analysts: tuple[str, ...]
    config: dict[str, Any]


@dataclass(frozen=True)
class AnalysisEvent:
    progress_percent: int
    message: str
    state_update: dict[str, Any] | None = None


@dataclass(frozen=True)
class AnalysisResult:
    final_state: dict[str, Any]
    decision: str


def run_analysis(
    command: AnalysisCommand,
    *,
    callbacks: tuple[Any, ...] | list[Any] = (),
    on_event: Callable[[AnalysisEvent], None] | None = None,
) -> AnalysisResult:
    graph = TradingAgentsGraph(
        selected_analysts=list(command.analysts),
        config=command.config,
        debug=False,
        callbacks=list(callbacks),
    )
    merged_state: dict[str, Any] = {}

    def handle_chunk(chunk: dict[str, Any]) -> None:
        merged_state.update(chunk)
        progress, message = estimate_progress(merged_state, command.analysts, command.config)
        if on_event is not None:
            on_event(AnalysisEvent(progress, message, dict(chunk)))

    final_state, decision = graph.propagate(
        command.ticker,
        command.trade_date,
        asset_type=command.asset_type,
        on_chunk=handle_chunk,
    )
    return AnalysisResult(final_state=final_state, decision=str(decision))
```

- [ ] **步骤 7：运行应用层、checkpoint 和 analyst execution 测试**

```bash
cd tg-core
uv run --extra dev pytest \
  tests/test_application_analysis.py \
  tests/test_application_progress.py \
  tests/test_checkpoint_resume.py \
  tests/test_analyst_execution.py -q
```

预期：全部通过。

- [ ] **步骤 8：提交任务 2**

```bash
git add tg-core/application \
  tg-core/tradingagents/graph/trading_graph.py \
  tg-core/tests/test_application_analysis.py \
  tg-core/tests/test_application_progress.py
git commit -m "refactor: add shared analysis application flow"
```

---

### Task 3: 拆出 PostgreSQL 基础模块

**文件：**

- 创建：`tg-core/infrastructure/__init__.py`
- 创建：`tg-core/infrastructure/database.py`
- 创建：`tg-core/infrastructure/analysis_jobs.py`
- 创建：`tg-core/infrastructure/llm_prices.py`
- 测试：`tg-core/tests/test_infrastructure_database.py`
- 测试：`tg-core/tests/test_infrastructure_analysis_jobs.py`
- 测试：`tg-core/tests/test_infrastructure_llm_prices.py`

**接口：**

- `database.connect(*, autocommit=False)`
- `database.init_database()`、`database.healthcheck()`、`database.analysis_execution_lock()`
- `analysis_jobs.claim_job()`、`update_progress()`、`mark_succeeded()`、`mark_failed()`
- `llm_prices.seed_fallback_model_prices()`、`get_model_prices()`、
  `store_refresh_result()`、`backfill_analysis_costs()`
- 不保留 `tradingagents.api.db` 兼容导入。

- [ ] **步骤 1：拆分现有 DB 测试并改为新 import**

将 `tests/test_api_db.py` 的测试拆入三个文件，并首先加入终态保护测试：

```python
def test_mark_succeeded_only_updates_running_job(monkeypatch):
    executed = []

    class Cursor:
        rowcount = 1

    class Connection:
        def execute(self, sql, params=()):
            executed.append((sql, params))
            return Cursor()

    @contextmanager
    def connect():
        yield Connection()

    monkeypatch.setattr(analysis_jobs.database, "connect", connect)
    analysis_jobs.mark_succeeded(
        job_id="00000000-0000-0000-0000-000000000001",
        final_state={},
        decision="Hold",
        report_path=None,
        token_usage={"total_tokens": 10},
        cost_breakdown={"total_cost_usd": 0.25},
    )

    assert "WHERE id = %s AND status = 'running'" in executed[0][0]
```

- [ ] **步骤 2：运行新基础设施测试并确认 import 失败**

```bash
cd tg-core
uv run --extra dev pytest \
  tests/test_infrastructure_database.py \
  tests/test_infrastructure_analysis_jobs.py \
  tests/test_infrastructure_llm_prices.py -q
```

预期：`ModuleNotFoundError: infrastructure`。

- [ ] **步骤 3：实现 database.py**

从现有 `api/db.py` 移动连接、DDL、healthcheck 和 advisory lock。公共连接代码固定为：

```python
DEFAULT_DATABASE_URL = "postgresql://tradingagents:tradingagents@localhost:5432/tradingagents"
ANALYSIS_LOCK_KEY = 8_724_631_904


def database_url() -> str:
    return os.getenv("TRADINGAGENTS_DATABASE_URL", DEFAULT_DATABASE_URL)


def connect(*, autocommit: bool = False):
    return psycopg.connect(database_url(), autocommit=autocommit, row_factory=dict_row)


@contextmanager
def analysis_execution_lock():
    with connect(autocommit=True) as conn:
        conn.execute("SELECT pg_advisory_lock(%s)", (ANALYSIS_LOCK_KEY,))
        try:
            yield
        finally:
            conn.execute("SELECT pg_advisory_unlock(%s)", (ANALYSIS_LOCK_KEY,))
```

`init_database()` 保持当前幂等 DDL，但不得调用外部价格 URL或费用回填。

- [ ] **步骤 4：实现 analysis_jobs.py 并收紧状态转换**

移动现有 job SQL。`mark_succeeded()` 接收已经算好的 `cost_breakdown`，不再主动查询价格：

```python
def mark_succeeded(
    *,
    job_id: UUID | str,
    final_state: dict,
    decision: str,
    report_path: str | None,
    token_usage: dict | None,
    cost_breakdown: dict,
) -> bool:
    usage = token_usage or {}
    with database.connect() as conn:
        cursor = conn.execute(
            """
            UPDATE analysis_jobs
            SET status = 'succeeded', final_state = %s, decision = %s,
                report_path = %s, tokens_used = %s, token_usage = %s,
                cost_usd = %s, cost_breakdown = %s, progress_percent = 100,
                current_step = 'Completed', finished_at = now(), updated_at = now(), error = NULL
            WHERE id = %s AND status = 'running'
            """,
            (
                Jsonb(final_state),
                decision,
                report_path,
                total_tokens(usage),
                Jsonb(usage),
                cost_breakdown["total_cost_usd"],
                Jsonb(cost_breakdown),
                job_id,
            ),
        )
    return cursor.rowcount == 1
```

`mark_failed()` 同样限定 `status = 'running'` 并返回 `bool`：

```python
def mark_failed(
    *,
    job_id: UUID | str,
    error: str,
    token_usage: dict | None,
    cost_breakdown: dict,
) -> bool:
    usage = token_usage or {}
    with database.connect() as conn:
        cursor = conn.execute(
            """
            UPDATE analysis_jobs
            SET status = 'failed', error = %s, tokens_used = %s,
                token_usage = %s, cost_usd = %s, cost_breakdown = %s,
                current_step = 'Failed', finished_at = now(), updated_at = now()
            WHERE id = %s AND status = 'running'
            """,
            (
                error,
                total_tokens(usage),
                Jsonb(usage),
                cost_breakdown["total_cost_usd"],
                Jsonb(cost_breakdown),
                job_id,
            ),
        )
    return cursor.rowcount == 1
```

调用方根据 `False` 记录状态冲突，不覆盖已有终态。

- [ ] **步骤 5：实现 llm_prices.py**

移动 fallback seed、price/source upsert、缓存查询和 backfill SQL。费用公式只能通过：

```python
from tradingagents.llm_clients.pricing import calculate_cost
```

使用，不得在基础设施模块重复公式或发起 HTTP 请求。

`seed_fallback_model_prices()`、`store_refresh_result()` 和
`backfill_analysis_costs()` 各自用 `database.connect()` 管理一次事务；不把 psycopg
connection 暴露给 application 或 API。

- [ ] **步骤 6：运行基础设施测试**

```bash
cd tg-core
uv run --extra dev pytest \
  tests/test_infrastructure_database.py \
  tests/test_infrastructure_analysis_jobs.py \
  tests/test_infrastructure_llm_prices.py -q
```

预期：全部通过。

- [ ] **步骤 7：提交任务 3**

```bash
git add tg-core/infrastructure \
  tg-core/tests/test_infrastructure_database.py \
  tg-core/tests/test_infrastructure_analysis_jobs.py \
  tg-core/tests/test_infrastructure_llm_prices.py
git commit -m "refactor: separate PostgreSQL infrastructure"
```

---

### Task 4: 建立持久化 Job 与价格刷新用例

**文件：**

- 创建：`tg-core/application/jobs.py`
- 创建：`tg-core/application/pricing.py`
- 测试：`tg-core/tests/test_application_jobs.py`
- 测试：`tg-core/tests/test_application_pricing.py`

**接口：**

- `CreateAnalysisJob`：与 HTTP schema 解耦的简单数据类
- `create_job(request: CreateAnalysisJob) -> dict`
- `run_job(job_id: UUID | str) -> None`
- `refresh_and_backfill_model_prices() -> None`

- [ ] **步骤 1：为 Job claim 和执行锁写失败测试**

在 `tests/test_application_jobs.py` 写入：

```python
from contextlib import contextmanager

from application import jobs


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
```

- [ ] **步骤 2：为价格刷新编排写失败测试**

在 `tests/test_application_pricing.py` 写入：

```python
from application import pricing


def test_refresh_fetches_then_persists_then_backfills(monkeypatch):
    events = []
    monkeypatch.setattr(
        pricing,
        "fetch_price_rows",
        lambda urls: ([{"model": "gpt-test"}], [{"source_url": "source"}]),
    )
    monkeypatch.setattr(
        pricing.llm_prices,
        "store_refresh_result",
        lambda rows, sources: events.append(("store", rows, sources)),
    )
    monkeypatch.setattr(
        pricing.llm_prices,
        "backfill_analysis_costs",
        lambda: events.append("backfill"),
    )

    pricing.refresh_and_backfill_model_prices()

    assert events[0][0] == "store"
    assert events[1] == "backfill"
```

- [ ] **步骤 3：运行测试并确认应用模块不存在**

```bash
cd tg-core
uv run --extra dev pytest \
  tests/test_application_jobs.py \
  tests/test_application_pricing.py -q
```

预期：新函数尚不存在导致收集或属性失败。

- [ ] **步骤 4：实现 CreateAnalysisJob 和 create_job**

`application/jobs.py` 定义：

```python
@dataclass(frozen=True)
class CreateAnalysisJob:
    ticker: str
    trade_date: date
    asset_type: str | None
    analysts: tuple[str, ...]
    config_overrides: dict[str, Any]
    output_language: str | None = None


def create_job(request: CreateAnalysisJob) -> dict:
    normalized_ticker = normalize_symbol(request.ticker)
    if not is_yahoo_safe(normalized_ticker):
        raise ValueError(f"invalid ticker symbol: {request.ticker!r}")

    asset_type = request.asset_type or detect_asset_type(normalized_ticker)
    analysts = filter_analysts(list(request.analysts or DEFAULT_ANALYSTS), asset_type)
    if not analysts:
        raise ValueError("at least one analyst must be selected after asset filtering")

    overrides = dict(request.config_overrides)
    if request.output_language:
        overrides["output_language"] = request.output_language
    config = build_config(overrides)
    payload = {
        "ticker": normalized_ticker,
        "trade_date": request.trade_date.isoformat(),
        "asset_type": asset_type,
        "analysts": analysts,
        "config_overrides": overrides,
        "output_language": config.get("output_language"),
    }
    return analysis_jobs.insert_job(
        job_id=uuid4(),
        ticker=normalized_ticker,
        trade_date=request.trade_date.isoformat(),
        asset_type=asset_type,
        analysts=analysts,
        request=payload,
        config=public_config(config),
    )
```

将当前 `api/service.py` 的 `DEFAULT_ANALYSTS`、`ALLOWED_CONFIG_OVERRIDES`、
`build_config()`、`public_config()`、`detect_asset_type()` 和 `filter_analysts()` 原样移入该模块；
删除旧模块后只能保留这一份实现。

- [ ] **步骤 5：实现 run_job**

核心编排固定为：

```python
def run_job(job_id: UUID | str) -> None:
    with database.analysis_execution_lock():
        row = analysis_jobs.claim_job(job_id)
        if row is None:
            return
        _run_claimed_job(row)


def _run_claimed_job(row: dict[str, Any]) -> None:
    tracker = TokenUsageCallback()
    config = dict(row.get("config") or {})
    try:
        config = build_config(row["request"].get("config_overrides") or {})
        command = AnalysisCommand(
            ticker=row["ticker"],
            trade_date=row["trade_date"].isoformat(),
            asset_type=row["asset_type"],
            analysts=tuple(row["analysts"]),
            config=config,
        )
        result = run_analysis(
            command,
            callbacks=(tracker,),
            on_event=lambda event: analysis_jobs.update_progress(
                job_id=row["id"],
                progress_percent=event.progress_percent,
                current_step=event.message,
            ),
        )
        report_path = save_api_report(
            result.final_state,
            ticker=row["ticker"],
            job_id=str(row["id"]),
            results_dir=Path(config["results_dir"]),
        )
        usage = tracker.summary()
        apply_pricing_model_fallback(usage, config)
        costs = calculate_cost(
            usage,
            llm_prices.get_model_prices(provider=str(config["llm_provider"])),
        )
        updated = analysis_jobs.mark_succeeded(
            job_id=row["id"],
            final_state=to_jsonable(result.final_state),
            decision=result.decision,
            report_path=str(report_path) if report_path else None,
            token_usage=usage,
            cost_breakdown=costs,
        )
        if not updated:
            logger.warning("Analysis job %s left running state before success update", row["id"])
    except Exception as exc:
        usage = tracker.summary()
        apply_pricing_model_fallback(usage, config)
        costs = calculate_cost(
            usage,
            llm_prices.get_model_prices(provider=str(config.get("llm_provider") or "openai")),
        )
        updated = analysis_jobs.mark_failed(
            job_id=row["id"],
            error=f"{type(exc).__name__}: {exc}",
            token_usage=usage,
            cost_breakdown=costs,
        )
        if not updated:
            logger.warning("Analysis job %s left running state before failure update", row["id"])


def save_api_report(
    final_state: dict[str, Any],
    *,
    ticker: str,
    job_id: str,
    results_dir: Path,
) -> Path | None:
    save_path = results_dir / "api_reports" / safe_ticker_component(ticker) / job_id
    try:
        return write_report_tree(final_state, ticker, save_path)
    except OSError:
        logger.warning(
            "Unable to save API report for job=%s ticker=%s path=%s",
            job_id,
            ticker,
            save_path,
            exc_info=True,
        )
        return None
```

将现有 `to_jsonable()` 和 `apply_pricing_model_fallback()` 原样移入该模块。Graph、LLM
或数据源异常写入 failed；报告目录 I/O 失败只记录 warning，不改变成功的分析结果。

- [ ] **步骤 6：实现 application/pricing.py**

```python
def refresh_and_backfill_model_prices() -> None:
    if not llm_prices.pricing_refresh_is_due():
        return
    price_rows, source_results = fetch_price_rows(PRICING_SOURCE_URLS)
    llm_prices.store_refresh_result(price_rows, source_results)
    llm_prices.backfill_analysis_costs()
```

外部价格源失败保存在 source result 中；数据库异常向上传播给 API lifespan 的安全包装日志。

- [ ] **步骤 7：运行应用 Job、定价和现有 API service 测试的迁移版本**

```bash
cd tg-core
uv run --extra dev pytest \
  tests/test_application_jobs.py \
  tests/test_application_pricing.py \
  tests/test_application_analysis.py -q
```

预期：全部通过。

- [ ] **步骤 8：提交任务 4**

```bash
git add tg-core/application/jobs.py \
  tg-core/application/pricing.py \
  tg-core/tests/test_application_jobs.py \
  tg-core/tests/test_application_pricing.py
git commit -m "refactor: add persistent analysis job use cases"
```

---

### Task 5: 将 FastAPI 迁移到顶层 api 并命名 job_worker

**文件：**

- 创建：`tg-core/api/__init__.py`
- 移动：`tg-core/tradingagents/api/app.py` -> `tg-core/api/app.py`
- 移动：`tg-core/tradingagents/api/formatters.py` -> `tg-core/api/formatters.py`
- 移动：`tg-core/tradingagents/api/schemas.py` -> `tg-core/api/schemas.py`
- 移动：`tg-core/tradingagents/api/security.py` -> `tg-core/api/security.py`
- 移动并重命名：`tg-core/tradingagents/api/runner.py` -> `tg-core/api/job_worker.py`
- 删除：`tg-core/tradingagents/api/`
- 修改：`tg-core/pyproject.toml:55-59`
- 修改：`tg-core/docker-compose.yml:26-33`
- 修改：`tg-core/tests/test_api_app.py`
- 修改：`tg-core/tests/test_api_security.py`
- 修改：`tg-core/tests/test_api_formatters.py`
- 修改：`tg-core/tests/test_application_jobs.py`
- 创建：`tg-core/tests/test_api_job_worker.py`
- 删除：`tg-core/tests/test_api_db.py`
- 删除：`tg-core/tests/test_api_service.py`

**接口：**

- 唯一服务入口：`api.app:app`
- `api.job_worker.job_worker.enqueue(job_id)`
- HTTP 路径与响应模型不变。

- [ ] **步骤 1：先将 API 测试 import 改到顶层并增加 worker 测试**

现有测试统一使用：

```python
from api import app as api_app
```

将旧 `tests/test_api_service.py` 的两个配置边界测试迁移到
`tests/test_application_jobs.py`，并使用新的应用层函数：

```python
def test_build_config_rejects_request_level_backend_url():
    with pytest.raises(ValueError, match="backend_url"):
        jobs.build_config({"backend_url": "http://attacker.invalid/v1"})


def test_build_config_rejects_unsupported_checkpoint_override():
    with pytest.raises(ValueError, match="checkpoint_enabled"):
        jobs.build_config({"checkpoint_enabled": True})
```

删除 `tests/test_api_db.py`，因为其中的连接、锁和费用持久化覆盖已由
`test_infrastructure_database.py`、`test_infrastructure_analysis_jobs.py` 和
`test_infrastructure_llm_prices.py` 取代；不得保留对已删除 `tradingagents.api.db` 的测试 import。

`tests/test_api_job_worker.py` 写入：

```python
from api.job_worker import AnalysisJobWorker


def test_enqueue_deduplicates_scheduled_job_ids():
    worker = AnalysisJobWorker()
    worker.enqueue("job-1")
    worker.enqueue("job-1")

    assert worker._queue.qsize() == 1
```

- [ ] **步骤 2：运行 API 测试并确认顶层 api 尚不存在**

```bash
cd tg-core
uv run --extra dev pytest \
  tests/test_api_app.py \
  tests/test_api_security.py \
  tests/test_api_formatters.py \
  tests/test_api_job_worker.py -q
```

预期：`ModuleNotFoundError: api`。

- [ ] **步骤 3：移动 FastAPI 文件并更新 imports**

`api/app.py` 使用：

```python
from api.formatters import analysis_document_from_row
from api.job_worker import job_worker
from api.schemas import AnalysisJob, AnalysisRequest, HealthResponse
from api.security import require_api_key
from application.jobs import CreateAnalysisJob, create_job
from application.pricing import refresh_and_backfill_model_prices
from infrastructure import analysis_jobs, database, llm_prices
```

`submit_analysis()` 将 Pydantic model 映射为 `CreateAnalysisJob` 后调用 `create_job()`。
列表和详情查询直接调用 `infrastructure.analysis_jobs`。

lifespan 的启动顺序固定为：

```python
database.init_database()
llm_prices.seed_fallback_model_prices()
analysis_jobs.recover_interrupted_jobs()
job_worker.start()
for job_id in analysis_jobs.list_queued_job_ids():
    job_worker.enqueue(job_id)
start_pricing_refresh()
```

关闭阶段只调用 `job_worker.stop()`。

- [ ] **步骤 4：实现 api/job_worker.py**

将现有线程队列改名，并只依赖应用用例：

```python
import logging
import queue
import threading
from uuid import UUID

from application.jobs import run_job


logger = logging.getLogger(__name__)
_STOP = object()


class AnalysisJobWorker:
    def __init__(self) -> None:
        self._queue: queue.Queue[UUID | str | object] = queue.Queue()
        self._scheduled: set[str] = set()
        self._mutex = threading.Lock()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(
            target=self._work,
            name="analysis-job-worker",
            daemon=True,
        )
        self._thread.start()

    def enqueue(self, job_id: UUID | str) -> None:
        key = str(job_id)
        with self._mutex:
            if key in self._scheduled:
                return
            self._scheduled.add(key)
        self._queue.put(job_id)

    def stop(self) -> None:
        if not self._thread:
            return
        self._queue.put(_STOP)
        self._thread.join(timeout=1)
        self._thread = None

    def _work(self) -> None:
        while True:
            job_id = self._queue.get()
            try:
                if job_id is _STOP:
                    return
                run_job(job_id)
            except Exception:
                logger.exception("Analysis job worker failed for %s", job_id)
            finally:
                if job_id is not _STOP:
                    with self._mutex:
                        self._scheduled.discard(str(job_id))
                self._queue.task_done()


job_worker = AnalysisJobWorker()
```

`api/app.py` lifespan 中调用 `job_worker.start()/enqueue()/stop()`。

- [ ] **步骤 5：更新包发现和 Docker 入口**

`pyproject.toml` 改为：

```toml
[tool.setuptools.packages.find]
include = ["tradingagents*", "cli*", "api*", "application*", "infrastructure*"]
```

`docker-compose.yml` 的 Uvicorn command 改为：

```yaml
command:
  - api.app:app
  - --host
  - 0.0.0.0
  - --port
  - "8000"
```

- [ ] **步骤 6：删除旧 tradingagents/api 并确认没有旧 import**

```bash
rg -n "tradingagents\.api|api\.runner" tg-core -g '*.py' -g '*.yml' -g '*.toml'
```

预期：没有输出。设计和历史文档中的说明不作为代码 import 检查对象。

删除已迁移或已被基础设施测试取代的旧测试：

```text
tests/test_api_db.py
tests/test_api_service.py
```

- [ ] **步骤 7：运行 API 契约测试**

```bash
cd tg-core
uv run --extra dev pytest \
  tests/test_api_app.py \
  tests/test_api_security.py \
  tests/test_api_formatters.py \
  tests/test_api_job_worker.py \
  tests/test_application_jobs.py \
  tests/test_infrastructure_analysis_jobs.py -q
```

预期：全部通过。

- [ ] **步骤 8：提交任务 5**

```bash
git add tg-core/api tg-core/application tg-core/infrastructure \
  tg-core/tradingagents/api tg-core/pyproject.toml tg-core/docker-compose.yml \
  tg-core/tests/test_api_app.py tg-core/tests/test_api_security.py \
  tg-core/tests/test_api_formatters.py tg-core/tests/test_api_job_worker.py \
  tg-core/tests/test_application_jobs.py tg-core/tests/test_api_db.py \
  tg-core/tests/test_api_service.py
git commit -m "refactor: move HTTP API to top-level package"
```

---

### Task 6: 让 CLI 使用共享分析执行流程

**文件：**

- 修改：`tg-core/cli/main.py:991-1267`
- 测试：`tg-core/tests/test_cli_analysis_application.py`
- 回归测试：`tg-core/tests/test_cli_config_precedence.py`
- 回归测试：`tg-core/tests/test_cli_symbol_handling.py`

**接口：**

- CLI 构造 `AnalysisCommand` 并调用 `application.analysis.run_analysis()`。
- CLI 的 chunk 展示逻辑通过 `AnalysisEvent.state_update` 消费，不访问
  `graph.graph.stream`、`graph.propagator` 或 `graph.memory_log`。

- [ ] **步骤 1：为 CLI 到 application 的映射写失败测试**

在 `tests/test_cli_analysis_application.py` 写入：

```python
from cli.main import _build_analysis_command


def test_build_analysis_command_maps_cli_selections():
    command = _build_analysis_command(
        {
            "ticker": "AAPL",
            "analysis_date": "2026-01-15",
            "asset_type": "stock",
        },
        analysts=["market", "news"],
        config={"llm_provider": "openai"},
    )

    assert command.ticker == "AAPL"
    assert command.analysts == ("market", "news")
    assert command.config["llm_provider"] == "openai"
```

- [ ] **步骤 2：运行测试并确认 helper 尚不存在**

```bash
cd tg-core
uv run --extra dev pytest tests/test_cli_analysis_application.py -q
```

预期：import 失败，提示 `_build_analysis_command` 不存在。

- [ ] **步骤 3：提取 CLI command 映射和事件处理函数**

`cli/main.py` 增加：

```python
def _build_analysis_command(selections, analysts, config) -> AnalysisCommand:
    return AnalysisCommand(
        ticker=selections["ticker"],
        trade_date=selections["analysis_date"],
        asset_type=str(getattr(selections["asset_type"], "value", selections["asset_type"])),
        analysts=tuple(analysts),
        config=config,
    )
```

将现有 `for chunk in graph.graph.stream` 循环体移动到
`handle_analysis_event(event)`，第一行固定为：

```python
chunk = event.state_update or {}
```

后续 message 去重、tool call 展示、agent 状态和 report section 更新保持原逻辑。

- [ ] **步骤 4：用 application.run_analysis 替换 CLI Graph 直连**

替换 Graph 构造、initial state 和 stream 循环：

```python
command = _build_analysis_command(selections, selected_analyst_keys, config)
result = run_application_analysis(
    command,
    callbacks=(stats_handler,),
    on_event=handle_analysis_event,
)
final_state = result.final_state
```

导入时使用别名避免与 Typer command `run_analysis` 冲突：

```python
from application.analysis import AnalysisCommand, run_analysis as run_application_analysis
```

- [ ] **步骤 5：确认 CLI 不再访问 Graph 内部执行对象**

```bash
rg -n "graph\.graph|graph\.propagator|graph\.memory_log|TradingAgentsGraph" tg-core/cli
```

预期：没有输出。CLI 仅通过 application 用例执行分析。

- [ ] **步骤 6：运行 CLI 与共享执行回归测试**

```bash
cd tg-core
uv run --extra dev pytest \
  tests/test_cli_analysis_application.py \
  tests/test_cli_config_precedence.py \
  tests/test_cli_symbol_handling.py \
  tests/test_application_analysis.py \
  tests/test_reporting.py -q
```

预期：全部通过。

- [ ] **步骤 7：提交任务 6**

```bash
git add tg-core/cli/main.py tg-core/tests/test_cli_analysis_application.py
git commit -m "refactor: run CLI through shared analysis application"
```

---

### Task 7: 更新文档、清理旧路径并完成验证

**文件：**

- 修改：`tg-core/docs/API_SERVICE.md`
- 修改：`tg-core/docs/PROJECT_ARCHITECTURE.md`
- 修改：`tg-core/docs/ARCHITECTURE_DESIGN.md`
- 修改：`tg-core/README.md`（仅当存在旧 API 入口说明）
- 修改：`tg-core/tests/` 中残留旧 import 的测试文件

**接口：**

- 文档唯一 HTTP 入口：`api.app:app`
- 文档架构图体现 `api/cli -> application -> tradingagents/infrastructure`。

- [ ] **步骤 1：更新 API 服务文档入口与模块说明**

将：

```text
tradingagents.api.app:app
```

替换为：

```text
api.app:app
```

并在架构说明中明确 `api/job_worker.py` 只管理 API 进程内后台线程，任务执行位于
`application/jobs.py`。

- [ ] **步骤 2：更新项目架构文档**

架构图统一为：

```text
api -----------+
               +--> application --> tradingagents
cli -----------+          |
                          +--> infrastructure
```

删除将数据库、token usage 或 pricing 描述为 API 内部模块的内容。

- [ ] **步骤 3：扫描旧路径和禁止依赖**

```bash
cd tg-core
rg -n "tradingagents\.api|api\.runner" . \
  -g '*.py' -g '*.yml' -g '*.toml' -g '*.md'
rg -n "fastapi|rich|langgraph|urllib|requests" infrastructure -g '*.py'
rg -n "psycopg" tradingagents/llm_clients -g '*.py'
```

预期：

- 第一条无旧代码或部署入口；历史设计文档只允许出现“删除旧路径”的说明。
- 第二条无输出。
- 第三条无输出。

- [ ] **步骤 4：运行 API、application、基础设施和 LLM 专项测试**

```bash
cd tg-core
uv run --extra dev pytest \
  tests/test_api_app.py \
  tests/test_api_security.py \
  tests/test_api_formatters.py \
  tests/test_api_job_worker.py \
  tests/test_application_analysis.py \
  tests/test_application_progress.py \
  tests/test_application_jobs.py \
  tests/test_application_pricing.py \
  tests/test_infrastructure_database.py \
  tests/test_infrastructure_analysis_jobs.py \
  tests/test_infrastructure_llm_prices.py \
  tests/test_llm_token_usage.py \
  tests/test_llm_pricing.py -q
```

预期：全部通过。

- [ ] **步骤 5：运行 Graph、checkpoint、provider 和报告回归测试**

```bash
cd tg-core
uv run --extra dev pytest \
  tests/test_risk_router_path_map.py \
  tests/test_checkpoint_resume.py \
  tests/test_analyst_execution.py \
  tests/test_provider_registry.py \
  tests/test_model_validation.py \
  tests/test_reporting.py -q
```

预期：全部通过。

- [ ] **步骤 6：运行 Ruff 和编译检查**

```bash
cd tg-core
uv run --extra dev ruff check \
  api application infrastructure cli tradingagents/llm_clients \
  tradingagents/graph/trading_graph.py tests
python -m compileall -q api application infrastructure cli tradingagents
```

预期：两个命令退出码均为 0。

- [ ] **步骤 7：运行完整测试套件**

```bash
cd tg-core
uv run --extra dev pytest -q
```

预期：全部非 opt-in live tests 通过；若环境缺少外部服务，只有已标记的 integration/live
测试跳过，不得出现失败。

- [ ] **步骤 8：提交文档与最终清理**

```bash
git add tg-core/docs tg-core/README.md tg-core/tests
git commit -m "docs: document simplified application architecture"
```

- [ ] **步骤 9：检查最终 diff**

```bash
git status --short
git diff main...HEAD --stat
git diff --check main...HEAD
```

预期：工作树干净，diff 只包含本计划涉及的架构、测试、部署和文档文件，
`git diff --check` 无输出。
