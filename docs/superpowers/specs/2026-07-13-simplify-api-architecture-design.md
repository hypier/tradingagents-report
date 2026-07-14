# TradingAgents 接口与基础服务解耦设计

## 背景

当前工程有两个用户入口：`cli/` 中的 Typer CLI，以及
`tradingagents/api/` 中的 FastAPI 服务。两者都会直接构造并流式执行
`TradingAgentsGraph`，因此分析初始化、进度推导、结果保存和运行观测形成了两套路径。

HTTP API 相关代码还承载了数据库连接、任务持久化、模型价格同步、费用计算和
LLM token 统计。这些能力并不属于 HTTP 接口本身，只是最初由 API 调用，因而被放入
了 `tradingagents/api/`。

本次改动以行为保持为前提，重新明确入口、应用编排、核心投研能力和基础服务的边界。
它不是框架化重写，不引入 Repository class、ports、依赖注入容器、ORM 或外部任务队列。

## 目标

1. 让 HTTP API 与 CLI 成为同级接口层。
2. CLI 和 HTTP worker 复用同一套分析执行流程。
3. 将 PostgreSQL 能力从 HTTP API 中移出，作为公共基础服务。
4. 将 token usage 和模型费用计算归入 LLM 子系统。
5. 保持现有 HTTP 路径、请求响应、任务状态、串行执行和报告内容不变。
6. 保持代码以直接函数调用为主，只拆分已经存在的明确职责。

## 非目标

- 不引入 Celery、Dramatiq、Redis Queue 或独立 worker 服务。
- 不实现多 worker 并行分析。
- 不引入数据库抽象接口或可插拔 Repository 实现。
- 不将现有 psycopg SQL 改写为 ORM。
- 不改变 LangGraph 节点、边、Agent prompt 或数据供应商路由。
- 不在本次改动中引入 Alembic；现有启动建表行为保持不变。
- 不改变该项目只提供投研分析、不执行真实交易的边界。

## 设计原则

依赖方向固定为：

```text
api -----------+
               +--> application --> tradingagents
cli -----------+          |
                          +--> infrastructure
```

- `api` 和 `cli` 负责输入输出适配，不直接操作 LangGraph 内部状态。
- `application` 负责编排一次分析或一个持久化任务，不包含 FastAPI 或 Rich 代码。
- `tradingagents` 保留 Agent、Graph、数据源、LLM 和报告等核心投研能力。
- `infrastructure` 提供具体 PostgreSQL 连接和 SQL 函数，不发起 HTTP 请求，不执行 Graph。
- 各层直接调用具体 Python 函数，不为单一实现增加抽象接口。

## 目标目录

```text
tg-core/
├── api/
│   ├── __init__.py
│   ├── app.py
│   ├── formatters.py
│   ├── job_worker.py
│   ├── schemas.py
│   └── security.py
├── cli/
├── application/
│   ├── __init__.py
│   ├── analysis.py
│   ├── jobs.py
│   ├── pricing.py
│   └── progress.py
├── infrastructure/
│   ├── __init__.py
│   ├── database.py
│   ├── analysis_jobs.py
│   └── llm_prices.py
└── tradingagents/
    ├── agents/
    ├── dataflows/
    ├── graph/
    ├── llm_clients/
    │   ├── token_usage.py
    │   └── pricing.py
    └── reporting.py
```

`application/pricing.py` 只承载现有的价格刷新与费用回填编排。它不是新的定价框架，
也不定义接口层次。

## 模块职责

### `api/`

顶层 `api` 是 FastAPI 接口适配器：

- `app.py`：路由和 lifespan。
- `schemas.py`：HTTP Pydantic 请求与响应模型。
- `security.py`：`X-API-Key` 校验。
- `formatters.py`：将应用结果转换为现有附件兼容 JSON。
- `job_worker.py`：API 进程内的单 worker 唤醒队列，只管理线程生命周期和 job ID 投递。

Docker Compose 的 Uvicorn 入口改为 `api.app:app`。迁移完成后删除
`tradingagents/api/`，顶层 `api/` 是唯一 HTTP 实现和唯一服务入口。

### `application/analysis.py`

提供 CLI 和 API 共用的分析运行流程。它负责：

- 标准化分析命令所需的运行参数。
- 构造 `TradingAgentsGraph`。
- 处理 pending memory、past context 和 instrument context。
- 创建初始状态并流式执行 Graph。
- 合并最终状态，记录状态日志和 decision memory。
- 返回最终状态、处理后的决策和运行事件。

公共模型保持简单：

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
```

`run_analysis(command, callbacks=())` 返回 `AnalysisResult`；可选的 `on_event` callback
接收 `AnalysisEvent`。CLI 用事件更新 Rich UI，API 用事件持久化进度。

本次不会创建 `AnalysisService` class。共享函数和数据类已经足以表达边界。

### `application/jobs.py`

负责持久化分析任务的用例：

- 校验并创建 queued job。
- 在 PostgreSQL advisory lock 内原子 claim job。
- 调用 `application.analysis.run_analysis()`。
- 汇总 token usage 和费用。
- 将任务更新为 succeeded 或 failed。

它直接调用 `infrastructure.analysis_jobs` 和 `infrastructure.llm_prices`，不增加
Repository 接口。

### `application/progress.py`

从 Graph 状态推导现有百分比和阶段文本。CLI 与 API 可以消费同一种
`AnalysisEvent`，但各自决定如何展示或保存。

### `application/pricing.py`

负责后台价格刷新流程：

```text
读取上次刷新状态
  -> 调用 LLM pricing source
  -> 写入价格和来源状态
  -> 回填已有任务费用
```

网络请求和纯解析由 `tradingagents.llm_clients.pricing` 提供；PostgreSQL SQL 由
`infrastructure.llm_prices` 提供。

### `infrastructure/`

`database.py` 只包含：

- `database_url()`
- `connect()`
- `healthcheck()`
- `init_database()`
- `analysis_execution_lock()`

`analysis_jobs.py` 只包含 `analysis_jobs` 表的 SQL，包括创建、查询、claim、进度更新、
成功、失败和中断恢复。

`llm_prices.py` 只包含 `llm_model_prices`、`llm_pricing_sources` 和费用回填相关 SQL。
它不调用外部 URL，也不包含 token 价格公式。

### `tradingagents/llm_clients/`

现有 `api/token_usage.py` 移为 `llm_clients/token_usage.py`，并吸收
`cli/stats_handler.py` 的 LLM/tool call 统计能力。CLI 和 API 使用同一个线程安全 callback。

现有 `api/pricing.py` 移为 `llm_clients/pricing.py`，保留：

- token usage 归一化后的费用计算。
- 模型名称归一化。
- 价格源 HTTP 获取和响应解析。
- fallback price 常量。

该模块不导入 psycopg，也不知道 analysis job。

## 核心运行流程

### CLI

```text
交互式选择
  -> AnalysisCommand
  -> application.analysis.run_analysis
  -> AnalysisEvent -> Rich UI
  -> AnalysisResult -> reporting
```

### HTTP API

```text
POST /api/v1/analyses
  -> HTTP schema 校验
  -> application.jobs.create_job
  -> infrastructure.analysis_jobs.insert_job
  -> api.job_worker.enqueue

worker
  -> application.jobs.run_job
  -> application.analysis.run_analysis
  -> AnalysisEvent -> infrastructure.analysis_jobs.update_progress
  -> token usage + price calculation
  -> infrastructure.analysis_jobs.mark_succeeded/mark_failed
```

## 状态机约束

任务状态继续使用：

```text
queued -> running -> succeeded
                  -> failed
```

迁移后所有终态更新必须限定原状态：

- claim：`queued -> running`
- success：`running -> succeeded`
- failure：`running -> failed`
- recovery：孤立的 `running -> failed`

非法或重复转换不得静默覆盖终态。SQL 更新没有命中预期行时，应用层记录冲突并停止处理。
本次不增加重试状态、取消状态或任务优先级。

## 错误处理

- 请求校验错误继续返回 HTTP 400/422。
- Job 不存在继续返回 HTTP 404。
- 数据库 healthcheck 失败继续返回 HTTP 503。
- Graph、LLM 或数据源异常由 `application.jobs.run_job` 捕获并写入 failed 状态。
- 模型价格源失败不得影响分析主流程；保留已缓存价格，并记录刷新来源错误。
- 报告文件保存失败继续不使分析失败，但必须记录带 job/ticker/path 的 warning，避免静默丢失。
- 数据库写入失败不由宽泛异常吞掉，由 worker 记录完整异常上下文。

## 对外行为

- HTTP URL、请求字段、响应字段和 API key 规则不变。
- 默认数据库 URL 和环境变量名不变。
- Docker Compose 默认使用新入口 `api.app:app`。
- CLI 命令名 `tradingagents` 不变。
- `TradingAgentsGraph` 的程序化公共入口保持可用。
- `pyproject.toml` 的 package discovery 增加 `api*`、`application*` 和
  `infrastructure*`。
- 这是新项目，不保留 `tradingagents.api.*` import 路径或旧 Uvicorn 入口。

## 测试策略

1. 为共享分析运行函数增加单元测试，验证初始化上下文、事件顺序、最终状态和异常传播。
2. 修改 CLI 测试，确认 CLI 使用共享运行函数并保持配置优先级。
3. 修改 API service 测试，确认 job claim、执行锁、进度和终态更新行为不变。
4. 将数据库测试按 connection、analysis jobs 和 LLM prices 三组拆分。
5. 将 token usage 测试放到 LLM client 测试范围，覆盖不同 provider metadata 形态。
6. 保留 FastAPI TestClient 契约测试，验证现有路径、认证和状态码。
7. 运行现有 checkpoint、analyst execution、provider 和报告专项测试，防止共享执行路径改变
   LangGraph 行为。

## 实施顺序

1. 先移动并统一 LLM token usage，保持调用者行为不变。
2. 提取共享 `application.analysis` 和 `application.progress`，先让 API 使用，再让 CLI 使用。
3. 移动数据库连接和 SQL 到 `infrastructure`。
4. 建立 `application.jobs` 与 `application.pricing`，删除原 `api/service.py` 和 `api/db.py`
   中的编排逻辑。
5. 将 FastAPI 实现移动到顶层 `api`，删除旧 `tradingagents/api/`，并更新部署配置和文档。
6. 运行全套相关测试和静态检查，确认接口和输出没有行为变化。

每一步都应先补充或调整测试，再移动最小范围代码；中间状态必须保持可导入和可测试。

## 完成标准

- CLI 与 API 不再各自实现 LangGraph 初始化和 stream 循环。
- `api/` 中不再存在数据库、价格计算或 token usage 实现。
- `infrastructure/` 不发起外部 HTTP 请求，不导入 FastAPI、Rich 或 LangGraph。
- `tradingagents/llm_clients/` 中的 usage/pricing 不导入 psycopg。
- HTTP 和 CLI 的现有用户行为保持不变。
- 相关单元测试、API 测试、Graph 路由测试、checkpoint 测试和 Ruff 检查通过。
