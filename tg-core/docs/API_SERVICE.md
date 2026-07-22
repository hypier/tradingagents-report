# TradingAgents API 服务设计

> 生成日期：2026-07-10
> 唯一 Uvicorn 服务入口：`api.app:app`
> 数据库：PostgreSQL，Docker Compose 服务名 `postgres`

## 1. 目标

将 TradingAgents 从交互式 CLI 和 Python API 释放为 HTTP 服务：

- 通过 REST API 提交分析任务。
- HTTP 请求快速返回 `job_id`，后台执行完整 LangGraph 分析流程并持续记录进度。
- PostgreSQL 保存请求参数、任务状态、最终决策、完整状态 JSON、报告路径和错误信息。
- Docker Compose 启动 API 服务和 PostgreSQL。
- API 启动时会检查共享表是否已由 `tg-web` Drizzle 迁移创建；不会在 Core 内执行 DDL。

当前 API 不提供真实交易、下单、账户或券商能力，只暴露投研分析任务。

## 1.1 模块边界

HTTP API 和 CLI 是并列的适配层。HTTP 服务唯一由 `api.app:app` 启动；路由、鉴权和响应格式位于 `api/`，共享分析、持久化 job、定价协调和进度估算位于 `application/`。`tradingagents/` 保持 LangGraph、Agent、数据源和 LLM 能力，`infrastructure/` 直接实现 PostgreSQL 访问。

`api/job_worker.py` 只维护 API 进程内的单线程唤醒队列和去重集合。它从队列取出 job ID 后调用 `application.jobs.run_job()`；任务的领取、分析执行、报告保存、成本计算和成功/失败状态更新都属于 `application/jobs.py`，不属于 worker。

模块之间保持直接函数调用：不额外引入 ports、Repository、依赖注入、ORM、Alembic 或外部队列。

## 2. 启动方式

先创建 `.env` 并生成两个独立随机值：

```bash
TRADINGAGENTS_API_KEY=$(openssl rand -hex 32)
TRADINGAGENTS_POSTGRES_PASSWORD=$(openssl rand -hex 32)
printf 'TRADINGAGENTS_API_KEY=%s\nTRADINGAGENTS_POSTGRES_PASSWORD=%s\n' \
  "$TRADINGAGENTS_API_KEY" "$TRADINGAGENTS_POSTGRES_PASSWORD" > tg-core/.env
```

再启动 PostgreSQL 和 API：

```bash
docker compose --env-file tg-core/.env -f docker/docker-compose.yml up --build -d postgres tradingagents-api
```

生产环境推荐从 GHCR 拉取镜像（见 [`docker/README.md`](../../docker/README.md)；`docker/` 为私有子模块 [`tradingagents-report-docker`](https://github.com/hypier/tradingagents-report-docker)）：

```bash
git submodule update --init --recursive
cd docker
# 编辑 config.env：填写密钥与版本
./login.sh
./start-prod.sh   # 自动 migrate 后启动全栈
```

GitHub Actions 工作流 [`.github/workflows/docker-publish.yml`](../../.github/workflows/docker-publish.yml) 在 `main` / tag / 手动触发时构建并推送 `tradingagents-api` 与 `tradingagents-web`。

API 默认监听：

```text
http://localhost:8000
```

Web BFF：

```text
http://localhost:8788
```

Swagger 文档：

```text
http://localhost:8000/docs
```

PostgreSQL 仅绑定本机回环地址。使用 `.env` 中密码连接：

```text
postgresql://tradingagents:<TRADINGAGENTS_POSTGRES_PASSWORD>@localhost:5432/tradingagents
```

容器内 API 使用：

```text
postgresql://tradingagents:<TRADINGAGENTS_POSTGRES_PASSWORD>@postgres:5432/tradingagents
```

可通过环境变量覆盖：

```bash
TRADINGAGENTS_DATABASE_URL=postgresql://user:password@host:5432/db
```

## 3. 数据库表

共享 PostgreSQL schema 由 `tg-web` 维护：

- 源定义：`tg-web/src/backend/database/schema.ts`
- 迁移：`tg-web/drizzle/`，需手动执行 `cd tg-web && pnpm db:migrate`（启动流程不会自动迁移）
- Core 只读写这些表，不负责 `CREATE` / `ALTER`

`analysis_jobs` 表字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | UUID | 任务 ID |
| `ticker` | TEXT | 标准化后的展示代码（`display_ticker`） |
| `exchange` | TEXT | 交易所代码（如 `HKEX`、`NASDAQ`）；未确认时可为空 |
| `trade_date` | DATE | 分析日期 |
| `asset_type` | TEXT | `stock` 或 `crypto` |
| `analysts` | JSONB | 已选择分析师列表 |
| `status` | TEXT | `queued`、`running`、`succeeded`、`failed` |
| `request` | JSONB | 原始请求和规范化请求 |
| `config` | JSONB | 本次任务的公开运行配置 |
| `display` | JSONB | 仅用于展示的标的元数据快照（如 `display_name`、`logo_url`、`country`） |
| `final_state` | JSONB | 成功后的完整图状态，已转成 JSON 可序列化对象 |
| `decision` | TEXT | 最终评级或交易信号 |
| `error` | TEXT | 失败原因 |
| `report_path` | TEXT | 保留字段；API 任务不写入本地 Markdown，值始终为 `NULL` |
| `created_at` | TIMESTAMPTZ | 创建时间 |
| `updated_at` | TIMESTAMPTZ | 更新时间 |
| `started_at` | TIMESTAMPTZ | 开始时间 |
| `finished_at` | TIMESTAMPTZ | 完成时间 |

索引：

- `(ticker, created_at DESC)`
- `(status, created_at DESC)`

同一 PostgreSQL 中还包含 TG-web 产品表：`account_users`、`billing_subscriptions`、`credit_billing_settings`、`credit_billing_setting_events`、`credit_accounts`、`credit_reservations`、`credit_ledger_entries`、`referral_relationships`、`stripe_webhook_events`、`billing_provider_configs` 和 `billing_config_audit_events`。`account_users.referral_code` 保存稳定邀请码，`account_users.onboarding_completed_at` 标识一次性首访结算；`credit_billing_settings.signup_grant_usd` 和 `referral_reward_usd` 分别保存新用户赠送及邀请奖励金额。`referral_relationships` 以被邀请用户为主键，保存邀请双方、邀请码及结算时金额、汇率和积分快照。

这些表由 tg-web Drizzle 迁移维护（`cd tg-web && pnpm db:migrate`）；Core 启动时校验所需表及积分结算列存在，但不执行 DDL。身份档案、Stripe Webhook、计费配置、人工调点、邀请结算和预扣由 TG-web BFF 写入；Core 不处理 Clerk 会话或支付。部署包含新版本 TG-web 前，必须先执行 Drizzle 迁移，再启动接收业务流量的容器。迁移为历史用户回填邀请码并设置 `onboarding_completed_at`，不会追溯发放新用户积分。

TG-web BFF 提供以下邀请与赠送接口（不属于 Core API）：

- `GET /invite/:code`：公开入口。有效邀请码写入 30 天有效的 `HttpOnly`、`SameSite=Lax` 归因 Cookie 并跳转 `/sign-up`；无效邀请码不写 Cookie，跳转 `/sign-up?invite=invalid`。
- `GET /api/account/referral`：需要 Clerk 会话，返回 `referralPath`、`successfulReferrals` 和 `earnedCredits`。
- `GET /api/admin/billing/credit-settings`：管理员读取积分汇率及赠送配置。
- `PUT /api/admin/billing/credit-settings`：管理员整体更新积分配置；请求和响应均包含 `signupGrantUsd` 与 `referralRewardUsd`。两者必须是 0 到 1,000,000 之间、最多两位小数的美元金额。

Clerk 用户首次发起已认证请求时，TG-web 在单个 PostgreSQL 事务中同步本地用户、创建积分账户、锁定首访状态、读取当前配置、发放新用户积分、绑定有效邀请关系、奖励邀请人并设置 `onboarding_completed_at`。积分按 `ceil(amount_usd * points_per_usd)` 换算，不叠加分析任务的 markup 或 reserve buffer。新用户和邀请奖励账本分别使用 `signup:<userId>:grant` 与 `referral:<inviteeId>:reward` 幂等键；事务失败时归因 Cookie 保留以便下次请求重试，成功后清除。

这里的“免费额度”是一次性注册赠送：积分用完即止，不按月刷新，也不创建 Stripe Customer、Checkout、Invoice 或 Subscription。

TG-web BFF 另提供仅管理员可调用的 `POST /api/admin/billing/plans/defaults`，通过 Stripe API 幂等创建或恢复每月 20、50、100 美元三档套餐，分别发放 2,000、5,000、10,000 积分。该操作同时升级旧版套餐的积分 metadata，使存量订阅在后续付款周期发放新积分。该端点不属于 Core API；Stripe 仍是产品、价格和订阅状态的数据源。

TG-web 的 `POST /api/billing/checkout` 和 `POST /api/billing/portal` 请求体包含当前界面语言 `locale`（仅允许 `en` 或 `zh`）；BFF 将该值传给 Stripe Checkout 和 Customer Portal，使 Stripe 托管页面与产品界面语言一致。这两个端点同样不属于 Core API。

当带 `request_id` 的 HTTP job 存在 `credit_reservations` 预留时，Core 在把 `analysis_jobs` 更新为 `succeeded` 的同一事务中，使用预留时的积分汇率和加价快照将 `cost_usd` 向上取整换算为最终积分，并执行多退少补；补扣可以使可用积分为负。`failed` 或进程重启回收的 job 在同一终态事务中全额释放预扣。旧的无快照 reservation 继续按原 `units` 结算。CLI、程序化调用和没有预留记录的 API job 保持原行为。账本写入使用 `analysis:<request_id>:consume|release` 幂等键。

## 4. 接口列表

### 4.1 健康检查

```http
GET /health
```

响应：

```json
{
  "status": "ok",
  "database": "ok",
  "detail": null
}
```

### 4.2 解析上市代码

```http
GET /api/v1/listings/resolve?ticker=300750.SZ
Authorization: Bearer <TRADINGAGENTS_API_KEY>
```

将 Yahoo 风格代码或 `EXCHANGE:SYMBOL` 解析为确定性上市身份，供前端展示与供应商路由使用。不做市场搜索。

响应示例：

```json
{
  "ticker": "300750.SZ",
  "exchange": "SZSE",
  "symbol": "300750",
  "display_ticker": "300750.SZ",
  "provider_symbol": "SZSE:300750"
}
```

说明：

- `display_ticker` 为 Yahoo 风格展示代码（美股为裸代码，如 `AAPL`）。
- `provider_symbol` 在已知交易所时为 `EXCHANGE:SYMBOL`（如 TradingView）；美股裸代码且未指定交易所时为 `null`。
- 无效代码返回 `400`。

### 4.3 提交分析任务

```http
POST /api/v1/analyses
Content-Type: application/json
Authorization: Bearer <TRADINGAGENTS_API_KEY>
```

请求：

```json
{
  "ticker": "NVDA",
  "trade_date": "2026-01-15",
  "asset_type": "stock",
  "analysts": ["market", "social", "news", "fundamentals"],
  "config_overrides": {
    "llm_provider": "openai",
    "deep_think_llm": "gpt-5.6-sol",
    "quick_think_llm": "gpt-5.6-sol",
    "max_debate_rounds": 1,
    "max_risk_discuss_rounds": 1,
    "output_language": "Chinese"
  }
}
```

说明：

- 必须提供 `ticker` 或 `instrument`。API 不搜索或猜测标的；调用方应先在前端完成搜索和上市地确认。
- `ticker` 可使用本地市场代码（如 `0005.HK`）或显式交易所代码（如 `HKEX:5`）。两者都会解析为同一确定性上市地。
- `instrument` 是显式形式，适合前端已确认的标的：`{"exchange":"HKEX","symbol":"5","display_ticker":"0005.HK"}`。`display_ticker` 可省略；提供时必须与交易所和代码一致。
- `display` 可选，写入任务的展示快照，例如 `{"display_name":"HSBC Holdings plc","logo_url":"https://..."}`。未提供 `country` 时，服务会按 `exchange` 推导（如 `HKEX`→`HK`）。
- 同时提供 `ticker` 和 `instrument` 时，两者必须表示同一上市地，否则请求返回 `422`。
- 已支持的本地市场后缀包括 `.HK`、`.SS`、`.SZ`、`.T`、`.TW` 和 `.TWO`；数据供应商在其各自适配层将该上市地转换为所需代码。
- `request_id` 可选，为客户端生成的 UUID。重试同一请求时复用它；服务会返回既有 job，不会创建重复分析。复用同一 `request_id` 但修改请求内容会返回 `409`。
- `asset_type` 可省略，服务会根据 ticker 判断 `stock` 或 `crypto`。
- Crypto 标的会自动移除 `fundamentals` 分析师。
- `config_overrides` 只允许覆盖安全白名单内的运行参数。
- `backend_url` 只能由服务端环境配置，不能由请求覆盖。
- API 进度执行路径不支持 `checkpoint_enabled`；中断任务会明确标记失败。

响应状态码：`202 Accepted`

响应：

```json
{
  "id": "8ac1c3aa-65b2-4b66-b688-ece60c451fd3",
  "ticker": "NVDA",
  "trade_date": "2026-01-15",
  "asset_type": "stock",
  "analysts": ["market", "social", "news", "fundamentals"],
  "status": "queued",
  "decision": null,
  "error": null,
  "report_path": null,
  "created_at": "2026-07-10T08:00:00Z",
  "updated_at": "2026-07-10T08:00:00Z",
  "started_at": null,
  "finished_at": null
}
```

### 4.4 查询任务列表

```http
GET /api/v1/analyses?status=succeeded&ticker=NVDA&limit=50&offset=0
```

查询参数：

| 参数 | 说明 |
|---|---|
| `ticker` | 可选，按 ticker 过滤 |
| `status` | 可选，按任务状态过滤 |
| `limit` | 默认 50，最大 200 |
| `offset` | 默认 0 |

### 4.5 查询任务详情与结果

```http
GET /api/v1/analyses/{job_id}
```

返回紧凑的任务状态、运行进度、决策、报告、用量和成本。任务未完成时 `reports` 为空；任务完成后从数据库的 `final_state` 生成报告内容。详情响应不包含运行事件。

成功响应包含：

```json
{
  "id": "8ac1c3aa-65b2-4b66-b688-ece60c451fd3",
  "status": "succeeded",
  "progress": {"percent": 100, "current_step": "Completed"},
  "decision": {"action": "Hold"},
  "reports": {},
  "usage": {"tokens": 1234, "token_usage": {}},
  "cost": {"usd": 0.01, "breakdown": {}}
}
```

### 4.6 查询运行事件

```http
GET /api/v1/analyses/{job_id}/events
```

仅返回任务阶段和工具调用的时间线。前端在任务运行中轮询此端点；完成后的报告详情不重复包含这些事件。

### 4.7 取消分析任务

```http
POST /api/v1/analyses/{job_id}/cancel
```

- `queued`：立即转为 `failed`（`error=Cancelled by user`），并释放积分预占。
- `running`：写入 `request.cancel_requested=true`；worker 在下一次进度回调或完成前检查该标志并结束任务。
- 已是终态：返回 `409`。

响应示例：

```json
{ "id": "…", "status": "cancelled" }
```

或：

```json
{ "id": "…", "status": "cancel_requested" }
```

## 5. curl 示例

提交：

```bash
curl -X POST http://localhost:8000/api/v1/analyses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TRADINGAGENTS_API_KEY" \
  -d '{
    "ticker": "NVDA",
    "request_id": "e941c1e8-efb6-4346-aa91-2afc811cb98f",
    "trade_date": "2026-01-15",
    "analysts": ["market", "news"],
    "config_overrides": {
      "llm_provider": "openai",
      "output_language": "Chinese"
    }
  }'
```

提交已由前端确认的港股也可以使用显式上市地对象：

```bash
curl -X POST http://localhost:8000/api/v1/analyses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TRADINGAGENTS_API_KEY" \
  -d '{
    "instrument": {
      "exchange": "HKEX",
      "symbol": "5",
      "display_ticker": "0005.HK"
    },
    "trade_date": "2026-01-15",
    "asset_type": "stock"
  }'
```

查询状态：

```bash
curl -H "Authorization: Bearer $TRADINGAGENTS_API_KEY" \
  http://localhost:8000/api/v1/analyses/<job_id>
```


## 6. 当前实现边界

- PostgreSQL 保存排队任务，单 worker 串行执行分析，避免全局数据源配置和记忆日志并发污染。
- 服务重启后会重新投递 `queued` 任务，并将被中断的 `running` 任务明确标记为失败。
- `api/job_worker.py` 是 API 进程内的单线程唤醒队列；实际 job 用例在 `application/jobs.py` 执行。
- 任务执行仍依赖外部 LLM 和数据源 API key。
- 失败任务会保存异常类型和异常消息到 `analysis_jobs.error`。
- `final_state` 会尽量保留完整状态，但 LangChain 消息对象会被转换为 JSON 友好的结构。
- 除 `/health` 外，API 使用 `Authorization: Bearer <TRADINGAGENTS_API_KEY>` 鉴权；公网部署仍应增加反向代理限流和审计。

## 7. 后续建议

1. 引入独立 worker 队列，例如 Redis Queue、Celery 或 Dramatiq。
2. 增加多用户 API key、密钥轮换和任务级权限隔离。
3. 增加任务取消接口。
4. 增加分页总数和运行耗时统计。
5. 将 `final_state` 拆分为报告表、消息表和工具调用表，便于检索和前端展示。

## 8. 运行进度与过程日志

提交任务后，任务详情接口会在运行过程中持续返回进度字段：

| 字段 | 说明 |
|---|---|
| `progress_percent` | 当前运行百分比，范围 `0-100` |
| `current_step` | 当前执行阶段，例如 `Running Market Analyst` |
| `events` | 进度事件列表，包含时间、百分比和消息 |

示例：

```json
{
  "status": "running",
  "progress_percent": 72,
  "current_step": "Running risk debate (1/3)",
  "events": [
    {
      "time": "2026-07-10T08:00:00Z",
      "progress_percent": 50,
      "message": "Running research debate (0/2)"
    }
  ]
}
```

查询进度：

```bash
curl -H "Authorization: Bearer $TRADINGAGENTS_API_KEY" \
  http://localhost:8000/api/v1/analyses/<job_id>
```

查看服务端打印的分析过程：

```bash
docker compose --env-file tg-core/.env -f docker/docker-compose.yml logs -f tradingagents-api
```

进度百分比是按 LangGraph 阶段估算：分析师团队、研究辩论、Trader、风险辩论、Portfolio Manager、报告保存。LLM 工具调用次数和外部数据源耗时会导致相邻百分比之间停留时间不一致。

## 9. 统一查询与附件格式返回

`GET /api/v1/analyses/{job_id}` 是 job 状态和分析结果的统一查询接口。任务未完成时返回同一套 JSON 结构，并通过 `status`、`progress_percent`、`current_step`、`events` 表示运行状态；任务完成后同一接口直接返回完整分析结果。

只保留 `GET /api/v1/analyses/{job_id}` 一个详情查询接口，避免生成重复 OpenAPI operationId。

返回结构对齐附件 JSON，核心字段包括：

- `_id`、`analysis_date`、`analysis_id`、`task_id`
- `analysts`、`stock_symbol`、`stock_name`、`market_type`
- `decision.action`、`decision.confidence`、`decision.risk_score`、`decision.target_price`、`decision.reasoning`
- `recommendation`、`summary`、`reports`
- `performance_metrics`、`tokens_used`、`token_usage`、`actual_amount_usd`、`cost_breakdown`
- `status`、`status_label`、`progress_percent`、`current_step`、`events`、`error`

提交任务时可以通过顶层 `output_language` 或 `config_overrides.output_language` 设定分析语言。顶层 `output_language` 优先级更高，并会写入 job 的持久化配置。机器可读的 `status` 始终保持固定英文枚举；本地化状态放在 `status_label`，阶段文案和分析内容按请求语言返回。

示例：

```json
{
  "ticker": "NVDA",
  "trade_date": "2026-01-15",
  "analysts": ["market", "news"],
  "output_language": "中文",
  "config_overrides": {
    "max_debate_rounds": 1,
    "max_risk_discuss_rounds": 1
  }
}
```

## 10. Token 使用量与费用统计

`tradingagents.llm_clients.token_usage.TokenUsageCallback` 汇总 LangChain 返回的 token usage。`tradingagents.llm_clients.pricing.calculate_cost` 负责纯成本计算；`infrastructure/llm_prices.py` 读取 `llm_model_prices`（启动时可 seed 内置 fallback）。分析 job 将汇总结果保存到 PostgreSQL：

- `tokens_used`：总 token 数，优先使用模型返回的 `total_tokens`。
- `token_usage.prompt_tokens`：输入 token 数。
- `token_usage.completion_tokens`：输出 token 数。
- `token_usage.reasoning_tokens`：推理 token 数，取决于模型是否返回该字段。
- `token_usage.by_model`：按模型名聚合的 token 明细。
- `performance_metrics.token_usage`：结果格式中的同一份 token 明细，便于前端统一读取。
- `actual_amount_usd` / `cost_usd`：按已缓存模型价格和实际 token usage 估算的美元金额。
- `cost_breakdown`：按模型拆分的输入、缓存输入、缓存写入、输出 token 与费用明细。
- `performance_metrics.cost_breakdown`：结果格式中的同一份费用明细。

LLM 提供商与开放模型由 tg-web 管理（`llm_providers` / `llm_models`）。Core 执行分析时按请求中的 `llm_provider` 从数据库解密 API Key（与 tg-web 共用 `BILLING_CONFIG_ENCRYPTION_KEY`），不再启动后台定价刷新，也不再使用 `llm_pricing_sources`。

如果上游模型或兼容网关没有返回 usage 字段，对应数值会保持为 `0`，不会影响分析任务完成。

## 11. Reddit 429 降级策略

Reddit RSS 是无鉴权公共接口，容易按 IP 触发 `HTTP 429 Too Many Requests`。服务默认遇到 429 后不会立即重试，而是进入全局冷却并在冷却期间跳过 Reddit 数据源，分析任务继续执行：

- `TRADINGAGENTS_REDDIT_RETRY_ON_429=false`：默认不重试，避免每个 subreddit 额外等待。
- `TRADINGAGENTS_REDDIT_429_COOLDOWN_SECONDS=900`：默认冷却 15 分钟。
- `TRADINGAGENTS_REDDIT_ENABLED=false`：可完全禁用 Reddit 数据源。

如果确实需要一次短退避重试，可设置 `TRADINGAGENTS_REDDIT_RETRY_ON_429=true`。
