# AGENTS.md

本文件约束本仓库内所有自动化编码 agent 的工作方式。作用范围为本文件所在目录及其所有子目录。

## 1. 项目背景

- 主工程位于 `tg-core/`。
- 该工程是 Python 金融投研多 Agent 框架，核心由 LangGraph 状态图编排。
- 对外入口为 `tg-core/cli/main.py` 的 Typer CLI、`tg-core/api/app.py` 的 FastAPI 服务，以及程序化 `tg-core/tradingagents/graph/trading_graph.py` 的 `TradingAgentsGraph`。
- HTTP API 将分析作为 PostgreSQL 持久化 job；当前 `api/job_worker.py` 只提供 API 进程内的单线程唤醒队列，`application/jobs.py` 使用 PostgreSQL advisory lock 串行执行。
- 项目输出研究报告、状态日志、结构化决策、可选记忆日志和 API job 结果，不实现真实交易下单。

## 2. 工作原则

- 优先做最小、明确、可验证的改动。
- 不重构无关代码，不顺手修复未被请求的问题。
- 保持现有目录结构、命名风格和模块边界。
- 修改前先读相关入口、调用链和测试，不凭文件名猜测行为。
- 不覆盖用户已有改动；遇到脏工作区时只处理本任务相关文件。
- 不提交 git commit，不创建分支，除非用户明确要求。

## 3. 代码风格

- Python 代码目标版本为 Python 3.10+。
- 遵循现有代码风格，行宽以 `pyproject.toml` 中 Ruff 配置为准。
- 优先复用现有工具函数、配置项和 Provider 抽象，不新增平行体系。
- 新增公共逻辑时优先放在已有职责目录内：
  - 图编排：`tg-core/tradingagents/graph/`
  - Agent 与 prompt：`tg-core/tradingagents/agents/`
  - 数据源与供应商路由：`tg-core/tradingagents/dataflows/`
  - LLM Provider 适配：`tg-core/tradingagents/llm_clients/`
  - CLI 交互：`tg-core/cli/`
  - HTTP 路由、鉴权与请求/响应 schema：`tg-core/api/`
  - CLI/API 共享用例与进度协调：`tg-core/application/`
  - PostgreSQL schema、job 与定价存储：`tg-core/infrastructure/`
- 只在复杂逻辑处添加简短注释，避免解释显而易见的代码。

## 4. 架构边界

- `TradingAgentsGraph` 是程序化运行的总入口，涉及 LLM 初始化、工具节点、记忆、checkpoint 和状态日志。
- `GraphSetup` 只负责 LangGraph 节点和边的装配，不应承担业务数据处理。
- `ConditionalLogic` 只负责图路由判断，不应调用外部服务。
- Agent 工厂只负责构造角色行为、prompt 和状态更新，不应绕过工具层直接访问供应商，除非现有实现已有明确例外。
- 数据访问应通过 `dataflows.interface.route_to_vendor()` 和稳定工具接口进入供应商实现。
- LLM Provider 差异应收敛在 `llm_clients/`，不要在 Agent 业务逻辑中散落 Provider 判断。
- `api/` 和 `cli/` 是并列适配层；共享分析流程、job 用例、进度和定价协调放在 `application/`，不要在路由或 CLI 中重复实现。
- `infrastructure/` 直接负责 PostgreSQL 读写；当前项目不使用 ORM、Repository、依赖注入容器或 Alembic。共享表结构由 `tg-web` 的 Drizzle schema/migrations 维护（手动执行 `pnpm db:migrate`）；Core 启动时只校验表存在，不执行 DDL，也不在启动流程中自动迁移。
- API job 的完整请求、配置快照、状态、进度、事件、结果和成本由 `analysis_jobs` 保存。变更 job 状态或事件时必须使用既有 `analysis_jobs` 接口，保持条件状态迁移和审计字段一致。
- 当前全局 advisory lock 是单节点串行执行的设计前提。修改 worker、队列、暂停/恢复或并发处理时，必须同时设计原子 claim、租约/恢复、幂等性和重试语义；不得仅移除锁就宣称支持多节点。
- SQLite checkpoint 属于 LangGraph 的可选恢复能力；涉及 checkpoint 时必须保持 ticker、日期和运行签名隔离，避免不同分析配置互相恢复。

## 5. 数据与金融安全

- 不把该项目描述成真实交易、券商接入或自动下单系统。
- 不新增真实下单、账户资金、券商 API、私钥或交易所执行逻辑，除非用户明确提出并确认边界。
- 不在代码、文档或测试中写入真实 API key、token、cookie、私钥或账户信息。
- 对 ticker、路径和文件名相关输入继续使用现有安全工具，如 `safe_ticker_component()`。
- HTTP API 的 ticker 与 `instrument` 输入须经 `dataflows.listings.resolve_listing()` 或 `listing_from_parts()` 规范化；不要把某个供应商的内部代码格式作为 API 的统一输入格式。
- 历史日期分析要注意 look-ahead bias；涉及行情、新闻或基本面日期边界时必须检查现有测试模式。

## 6. 配置规范

- 默认配置集中在 `tg-core/tradingagents/default_config.py`。
- 新增可环境变量覆盖的配置时，应同步更新 `_ENV_OVERRIDES`。
- 布尔、整数、浮点配置应保持启动时显式校验，不静默吞掉错误值。
- 数据供应商配置应尊重 `data_vendors` 和 `tool_vendors` 的优先级。
- 不要让供应商路由静默调用用户未配置的 Provider；fallback 链必须显式配置。
- API 请求级配置只能经 `application.jobs.ALLOWED_CONFIG_OVERRIDES` 允许并由 `build_config()` 合并；不可允许请求覆盖 `backend_url`、checkpoint 路径、凭据或其他运行环境边界。
- Provider 的模型能力与参数校验应复用 `llm_clients/` 的工厂、注册表和能力表；新增 Provider 或模型时同步更新对应测试。

## 7. 测试与验证

- 修改代码后优先运行与改动范围最小相关的测试。
- 常用验证命令：
  - `cd tg-core && .venv/bin/pytest tests/test_<area>.py`
  - `cd tg-core && .venv/bin/python -m py_compile <changed_file.py>`
  - `cd tg-core && .venv/bin/ruff check <changed_paths>`
- 修改 HTTP API、job 用例或 PostgreSQL 存储时，重点检查：
  - `tests/test_api_contract.py`
  - `tests/test_api_job_worker.py`
  - `tests/test_application_jobs.py`
  - `tests/test_infrastructure_analysis_jobs.py`
  - `tests/test_infrastructure_database.py`
- 若改动 LangGraph 路由，重点检查：
  - `tests/test_risk_router_path_map.py`
  - `tests/test_checkpoint_resume.py`
  - `tests/test_analyst_execution.py`
- 若改动数据源或 ticker，重点检查：
  - `tests/test_vendor_routing.py`
  - `tests/test_vendor_errors.py`
  - `tests/test_application_jobs.py`
  - `tests/test_api_contract.py`
  - `tests/test_instrument_identity.py`
  - `tests/test_symbol_normalization_paths.py`
  - `tests/test_symbol_utils.py`
  - `tests/test_news_lookahead.py`
  - `tests/test_yfinance_stale_ohlcv_guard.py`
- 若改动 LLM Provider，重点检查：
  - `tests/test_provider_registry.py`
  - `tests/test_model_validation.py`
  - 对应 Provider 的专项测试文件
- 不能运行测试时，在最终说明中明确原因和建议命令。

## 8. 文档规范

- 用户要求架构、流程或说明文档时，优先写入 `tg-core/docs/`。
- 修改 HTTP API 的契约、认证、任务状态或部署方式时，同步更新 `tg-core/docs/API_SERVICE.md`；修改整体模块边界或执行流程时，同步更新 `tg-core/docs/ARCHITECTURE_DESIGN.md`。
- Mermaid 图可以用于架构图、运行流程图和时序图。
- 文档应说明真实实现边界，不把 README 中的愿景描述误写成当前代码行为。
- 中文文档使用 UTF-8 编码。若 PowerShell 显示乱码，优先判断终端编码，不直接认定文件损坏。

## 9. 文件操作规范

- 手工编辑文件时使用 `apply_patch`。
- 不使用破坏性命令清理目录或重置 git 状态，除非用户明确要求。
- 不改动生成物、大体积二进制或无关资源。
- 保持新增文件路径清晰，避免在仓库根目录散落临时文件。

## 10. 交付说明

- 最终回复应简洁说明：
  - 修改了哪些文件
  - 解决了什么问题
  - 做了哪些验证
  - 未验证项及原因
- 文件引用使用可点击路径，并标注起始行。
