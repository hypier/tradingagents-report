# TradingAgents API 服务设计

> 生成日期：2026-07-10
> 服务入口：`tradingagents.api.app:app`
> 数据库：PostgreSQL，Docker Compose 服务名 `postgres`

## 1. 目标

将 TradingAgents 从交互式 CLI 和 Python API 释放为 HTTP 服务：

- 通过 REST API 提交分析任务。
- HTTP 请求快速返回 `job_id`，后台执行完整 LangGraph 分析流程并持续记录进度。
- PostgreSQL 保存请求参数、任务状态、最终决策、完整状态 JSON、报告路径和错误信息。
- Docker Compose 启动 API 服务和 PostgreSQL。

当前 API 不提供真实交易、下单、账户或券商能力，只暴露投研分析任务。

## 2. 启动方式

先创建 `.env` 并生成两个独立随机值：

```bash
TRADINGAGENTS_API_KEY=$(openssl rand -hex 32)
TRADINGAGENTS_POSTGRES_PASSWORD=$(openssl rand -hex 32)
printf 'TRADINGAGENTS_API_KEY=%s\nTRADINGAGENTS_POSTGRES_PASSWORD=%s\n' \
  "$TRADINGAGENTS_API_KEY" "$TRADINGAGENTS_POSTGRES_PASSWORD" > .env
```

再启动 PostgreSQL 和 API：

```bash
docker compose up --build postgres tradingagents-api
```

API 默认监听：

```text
http://localhost:8000
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

API 启动时自动创建 `analysis_jobs` 表：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | UUID | 任务 ID |
| `ticker` | TEXT | 标准化后的 Yahoo ticker |
| `trade_date` | DATE | 分析日期 |
| `asset_type` | TEXT | `stock` 或 `crypto` |
| `analysts` | JSONB | 已选择分析师列表 |
| `status` | TEXT | `queued`、`running`、`succeeded`、`failed` |
| `request` | JSONB | 原始请求和规范化请求 |
| `config` | JSONB | 本次任务的公开运行配置 |
| `final_state` | JSONB | 成功后的完整图状态，已转成 JSON 可序列化对象 |
| `decision` | TEXT | 最终评级或交易信号 |
| `error` | TEXT | 失败原因 |
| `report_path` | TEXT | Markdown 报告路径 |
| `created_at` | TIMESTAMPTZ | 创建时间 |
| `updated_at` | TIMESTAMPTZ | 更新时间 |
| `started_at` | TIMESTAMPTZ | 开始时间 |
| `finished_at` | TIMESTAMPTZ | 完成时间 |

索引：

- `(ticker, created_at DESC)`
- `(status, created_at DESC)`

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

### 4.2 提交分析任务

```http
POST /api/v1/analyses
Content-Type: application/json
X-API-Key: <TRADINGAGENTS_API_KEY>
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

### 4.3 查询任务列表

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

### 4.4 查询任务详情与结果

```http
GET /api/v1/analyses/{job_id}
```

统一返回任务状态、运行进度和分析结果。任务未完成时 `reports` 可能为空；任务完成后返回完整附件格式 JSON。

成功响应包含：

```json
{
  "task_id": "8ac1c3aa-65b2-4b66-b688-ece60c451fd3",
  "status": "succeeded",
  "status_label": "completed",
  "decision": {"action": "Hold"},
  "reports": {},
  "report_path": "/home/appuser/.tradingagents/logs/api_reports/NVDA/8ac1c3aa.../complete_report.md"
}
```

## 5. curl 示例

提交：

```bash
curl -X POST http://localhost:8000/api/v1/analyses \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $TRADINGAGENTS_API_KEY" \
  -d '{
    "ticker": "NVDA",
    "trade_date": "2026-01-15",
    "analysts": ["market", "news"],
    "config_overrides": {
      "llm_provider": "openai",
      "output_language": "Chinese"
    }
  }'
```

查询状态：

```bash
curl -H "X-API-Key: $TRADINGAGENTS_API_KEY" \
  http://localhost:8000/api/v1/analyses/<job_id>
```


## 6. 当前实现边界

- PostgreSQL 保存排队任务，单 worker 串行执行分析，避免全局数据源配置和记忆日志并发污染。
- 服务重启后会重新投递 `queued` 任务，并将被中断的 `running` 任务明确标记为失败。
- 当前 worker 仍运行在 API 进程内；生产环境建议替换为独立队列和 worker。
- 任务执行仍依赖外部 LLM 和数据源 API key。
- 失败任务会保存异常类型和异常消息到 `analysis_jobs.error`。
- `final_state` 会尽量保留完整状态，但 LangChain 消息对象会被转换为 JSON 友好的结构。
- 除 `/health` 外，API 使用 `X-API-Key` 鉴权；公网部署仍应增加反向代理限流和审计。

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
curl -H "X-API-Key: $TRADINGAGENTS_API_KEY" \
  http://localhost:8000/api/v1/analyses/<job_id>
```

查看服务端打印的分析过程：

```bash
docker compose logs -f tradingagents-api
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

分析任务会通过 LangChain LLM callback 汇总模型返回的 token usage，并保存到 PostgreSQL：

- `tokens_used`：总 token 数，优先使用模型返回的 `total_tokens`。
- `token_usage.prompt_tokens`：输入 token 数。
- `token_usage.completion_tokens`：输出 token 数。
- `token_usage.reasoning_tokens`：推理 token 数，取决于模型是否返回该字段。
- `token_usage.by_model`：按模型名聚合的 token 明细。
- `performance_metrics.token_usage`：结果格式中的同一份 token 明细，便于前端统一读取。
- `actual_amount_usd` / `cost_usd`：按官方模型价格和实际 token usage 估算的美元金额。
- `cost_breakdown`：按模型拆分的输入、缓存输入、缓存写入、输出 token 与费用明细。
- `performance_metrics.cost_breakdown`：结果格式中的同一份费用明细。

服务就绪后会在后台同步模型价格到 PostgreSQL 的 `llm_model_prices` 表；距离上次成功不足一小时会跳过同步。同步状态保存在 `llm_pricing_sources` 表，任务费用只读取已缓存价格，不等待外部价格源。

当前价格源：

- `https://models.dev/api.json`
- `https://basellm.github.io` 派生的结构化端点：`/api.json`、`/models.json`、`/pricing.json`

价格字段按每 100 万 tokens 计费：`input`、`cache_read`、`cache_write`、`output`。如果价格源暂时不可用，服务会保留已有数据库价格并使用内置 `gpt-5.6-sol` fallback，不阻塞分析任务。

如果上游模型或兼容网关没有返回 usage 字段，对应数值会保持为 `0`，不会影响分析任务完成。

## 11. Reddit 429 降级策略

Reddit RSS 是无鉴权公共接口，容易按 IP 触发 `HTTP 429 Too Many Requests`。服务默认遇到 429 后不会立即重试，而是进入全局冷却并在冷却期间跳过 Reddit 数据源，分析任务继续执行：

- `TRADINGAGENTS_REDDIT_RETRY_ON_429=false`：默认不重试，避免每个 subreddit 额外等待。
- `TRADINGAGENTS_REDDIT_429_COOLDOWN_SECONDS=900`：默认冷却 15 分钟。
- `TRADINGAGENTS_REDDIT_ENABLED=false`：可完全禁用 Reddit 数据源。

如果确实需要一次短退避重试，可设置 `TRADINGAGENTS_REDDIT_RETRY_ON_429=true`。
