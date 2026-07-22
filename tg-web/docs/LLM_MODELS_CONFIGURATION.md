# LLM 模型人工配置设计

本文描述「模型配置」能力的目标形态：管理端人工维护提供商与模型，用户从已开放模型中选择后发起分析；Core 只负责按请求读取凭据并执行分析。

**范围边界（严格）**

- **本期只做模型配置**：提供商、API Key、模型目录、默认可选模型、用户选型、去掉 Core 侧模型刷新工人。
- **价格计算 / 积分预扣 / `calculate_cost` / 任务 `cost_usd` 结算：本期一律不改。**
- **不做旧版兼容**：开发时直接改表、改 API、改 UI；不保留启动爬价、环境变量 Key 回退或双读路径。

落地后同步更新 `PRODUCT_FUNCTIONS.md`、`tg-core/docs/API_SERVICE.md`、`tg-core/docs/FUNCTIONAL_BACKLOG.md` §1。

## 1. 目标

1. 删除 Core 启动时的 LLM 定价/目录自动刷新工人，并**删除** `llm_pricing_sources` 表及相关读写。
2. 模型运营能力全部收归 **tg-web 管理端**（提供商、API Key、模型录入、手动同步价格/参数、开放状态、两个默认分析模型）。
3. 管理员在**新建或编辑模型**时可手动触发「同步价格与其他参数」；也可手填。同步是录入辅助，不是对用户侧的自动改价工人。
4. 提供商支持在库内配置 API Key（加密存储），替代原先依赖配置文件 / 环境变量的方式。
5. **开放模型** = 用户分析时可选择的模型；管理员另指定**两个默认分析模型**（快速 + 深度）。
6. Core **不再**维护模型目录或刷新价格；创建/执行分析时根据请求中的提供商/模型，从数据库读取对应 API Key（及必要的 `backend_url` 等），调用既有 LLM 工厂跑报告。

## 2. 非目标

- 不修改价格计算、成本回填、积分预估与结算逻辑。
- 不实现每用户自带 Key、不实现多租户凭据隔离。
- 不把行情数据源（TradingView 等）并入本页。
- 不保留「距上次成功 N 小时自动爬价」或启动后台线程。
- 不做迁移期双轨兼容（无 env Key 回退、无旧管理只读页并存）。

## 3. 产品概念

| 概念 | 说明 |
|------|------|
| 提供商 | 目录实例：唯一 `id` + Core `driver` + 展示名、`backend_url`、加密 API Key、是否启用。同一 `driver` 可多实例。 |
| 模型 | 某提供商下的模型 ID；含展示名、用途（`quick` / `deep` / `both`）、价格与参数字段、是否开放。 |
| 开放 | `enabled=true` 的模型出现在用户分析选型里。 |
| 手动同步 | 管理员在模型新建/编辑界面点击同步，从上游 API 拉取价格与参数写入该模型行；可反复手动触发。 |
| 默认分析模型 | 全局恰好两个引用：默认快速模型、默认深度模型；用户未改选型时使用。 |

## 4. 职责划分

```text
管理员 (tg-web /admin/llm/providers · /admin/llm/models)
  → 配置提供商 + API Key（入库加密）
  → 新建/编辑模型，可选「同步价格与参数」或手填
  → 标记开放；默认分析模型在产品设置中指定

用户 (tg-web 分析页)
  → 从开放模型中选择 quick + deep（默认预填）
  → 提交分析；BFF 校验后转 Core

Core
  → 接收请求中的 provider / quick_think_llm / deep_think_llm
  → 从 DB 按目录 id 读取 API Key / backend_url / driver
  → 将运行时 `llm_provider` 设为 driver，用既有 LLM 工厂执行分析
  → 不负责模型目录 CRUD、不负责爬价、不写 llm_pricing_sources
```

价格字段落在 `llm_models` 上，供管理端展示与后续「价格计算」功能使用；**本期 Core / 计费代码不消费这些字段做结算变更。**

## 5. 删除项（直接删，无兼容）

| 删除对象 | 说明 |
|----------|------|
| `start_pricing_refresh` / `_refresh_pricing_safely` | `tg-core/api/app.py` |
| `application/pricing.refresh_and_backfill_model_prices` 的启动调用 | 整段刷新编排若仅服务工人，则删除该用例及仅被其使用的辅助代码 |
| 表 `llm_pricing_sources` | Drizzle 迁移删除；Core `require_schema` / `_REQUIRED_TABLES` 去掉该表；仓库中所有读写与测试一并删 |
| 管理页「价格源」区块 | 拆为 `/admin/llm/providers` 与 `/admin/llm/models` 列表页 |
| 从环境变量读取 LLM API Key 作为产品运行路径 | 产品分析路径改为只读 DB；CLI 本地开发若仍用 env，与产品路径分离，不在本文强制保留产品回退 |

`llm_model_prices` 与 `calculate_cost`：**本期不动**（属价格计算功能）。工人删掉后该表不再被自动填充；是否在后续价格功能中改为读 `llm_models` 另开需求。

## 6. 数据模型

表由 tg-web Drizzle 维护；Core 启动校验其运行所需表（含提供商凭据表，以便读 Key）。

### 6.1 `llm_providers`

| 字段 | 说明 |
|------|------|
| `id` | **目录实例**唯一键（小写 slug，如 `nbapi`、`openai-prod`）。分析请求里的 `llm_provider` 传此 id。 |
| `driver` | Core LLM **工厂类型**（白名单，与 `LLM_PROVIDER_IDS` 对齐）。同 `driver` 可有多条实例。 |
| `display_name` | 展示名。 |
| `enabled` | 提供商是否可用；停用后其下模型不可选。 |
| `backend_url` | 可选基址；`openai_compatible` **必填**。 |
| `api_key_ciphertext` | 应用主密钥（如复用/对齐现有 `BILLING_CONFIG_ENCRYPTION_KEY` 一类机制）AES-GCM 加密后的 API Key。 |
| `api_key_hint` | 掩码展示（如 `sk-...abc`），API 永不回说明文。 |
| `sort_order` | 排序。 |
| `notes` | 备注。 |
| `created_at` / `updated_at` | 时间戳。 |

- `id` 与 `driver` 解耦：例如多条 `openai_compatible`（不同 Base URL），或多条同驱动不同 Key/环境。
- 创建后 **不可改 `driver`**；改协议请新建实例。
- 仅允许 Core 支持的 `driver` 白名单。
- 更新 Key：请求体传新明文 → 服务端加密入库；省略字段表示不改 Key。
- 列表/详情只返回 `api_key_hint` 与 `has_api_key`。
- Core 执行 job：按 `config.llm_provider`（= 目录 `id`）查库，再把 `config.llm_provider` **改写为 `driver`** 交给工厂。

### 6.2 `llm_models`

| 字段 | 说明 |
|------|------|
| `id` | UUID。 |
| `provider_id` | FK → `llm_providers.id`。 |
| `model` | 上游模型 ID。 |
| `display_name` | 展示名。 |
| `role` | `quick` \| `deep` \| `both`。 |
| `enabled` | 是否对用户开放（可选作分析模型）。 |
| `currency` / `unit_tokens` | 价格单位元数据（默认 USD / 1_000_000）。 |
| `input_price` / `output_price` | 可空；同步或手填。 |
| `cached_input_price` / `cache_write_price` | 可空。 |
| `context_window` / `max_output_tokens` | 可空，同步或手填。 |
| `params` | JSONB，其它参数（reasoning 档位等）。 |
| `capabilities` | JSONB，可选能力标记。 |
| `synced_at` | 最近一次手动同步成功时间。 |
| `sync_error` | 最近一次同步失败信息（管理端可见）。 |
| `created_at` / `updated_at` | 时间戳。 |

唯一约束：`(provider_id, model)`。

开放不强制已有价格（价格计算本期不改）；是否提示「未同步价格」由管理端 UX 决定。

### 6.3 默认分析模型

存在产品设置键 **`llm`**（`LLM_SETTINGS_KEY`）：

```json
{
  "defaultQuickModelId": "<llm_models.id>",
  "defaultDeepModelId": "<llm_models.id>"
}
```

管理端在 **`/admin/settings`** 编辑；保存走 `PATCH /api/admin/settings` 的 `llm` 字段（服务端校验开放状态、role、同提供商）。

约束：两个默认必须指向**已开放**模型；role 需分别允许作 quick / deep（`both` 可兼任）；须同一提供商且该提供商已启用并有 Key。

### 6.4 直接删除

- 表 `llm_pricing_sources`：删除。
- 不新增「价格源」替代表。

## 7. 管理端（`/admin/llm/providers` · `/admin/llm/models`）

### 7.1 提供商

- CRUD：选择白名单 Provider、展示名、`backend_url`、启用状态。
- **API Key**：录入/轮换；界面仅显示掩码；支持清除。
- 无 Key 的提供商：其下模型不可开放给用户（或开放但提交分析时失败——推荐保存时即要求启用提供商必须有 Key）。

### 7.2 模型

- 新建 / 编辑：选择提供商、模型 ID、展示名、role、是否开放；价格与参数可手填。
- **同步价格与参数**（新建页与编辑页均提供）：
  - 使用该提供商库内 API Key（及 `backend_url`）请求上游目录/定价接口（按 Provider 适配）。
  - 成功则写回价格、上下文、`params`/`capabilities`、`synced_at`，清空 `sync_error`。
  - 失败则写 `sync_error`，不清空已有手填值（除非产品选择覆盖策略：仅更新返回非空字段）。
- 不在「勾选开放」时自动联网；开放只是目录可见性开关。
- 全局默认快速/深度模型在 **产品设置**（`/admin/settings`）维护，不在本页。

### 7.3 审计

写入操作记 audit（provider upsert、key 轮换仅记「已更新」不记明文、model upsert、sync、设默认）。

## 8. 用户侧

- `GET /api/llm-catalog`：已启用提供商 + 其下已开放模型；标明两个默认 ID。
- 分析提交：选择（或默认）quick + deep 模型；BFF 校验均已开放，解析为 `llm_provider` / `quick_think_llm` / `deep_think_llm` 传给 Core。
- 首期建议 quick/deep 属于同一提供商（实现简单；若放宽需保证 Core 能同时持有多提供商 Key——当前图一般单 provider）。
- 无开放模型或未配置默认：禁止提交并提示管理员配置。

本期**不改** estimate / 积分计算公式；若提交 body 增加模型字段，仅保证转发与校验，预扣逻辑保持现状。

## 9. Core 行为变更

| 项 | 行为 |
|----|------|
| 启动 | 不再 seed/refresh 定价源；不再要求 `llm_pricing_sources` 存在。 |
| 读 Key | 执行分析前按 `config.llm_provider`（目录实例 id）从 `llm_providers` 解密 API Key，并改写为 `driver` 供工厂使用；缺失则任务失败，错误可定位且不泄露 Key。 |
| 读模型 | 使用请求中的 `quick_think_llm` / `deep_think_llm`；**不**在 Core 内维护开放目录（目录校验在 tg-web）。 |
| 工厂 | 仍走 `llm_clients`；`api_key` / `backend_url` 来自 DB 行，而非 `PROVIDER_API_KEY_ENV` 产品路径。 |
| 成本 | 不改。 |

tg-web 与 Core 共用同一 PostgreSQL 中的 `llm_providers`（及必要时的解密约定）。解密密钥通过双方部署配置注入同一应用主密钥，或仅 Core 持有解密能力且 tg-web 只写密文——推荐：**加解密逻辑与主密钥仅在服务端共享库/约定一致，tg-web 写入密文，Core 读取解密**。

## 10. API 草案

### 管理端

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET/PUT` | `/api/admin/llm/providers`、`/api/admin/llm/providers/:id` | 提供商列表与保存（含 Key 写入） |
| `DELETE` | `/api/admin/llm/providers/:id/api-key` | 清除 Key |
| `GET/POST/PATCH/DELETE` | `/api/admin/llm/models`… | 模型 CRUD |
| `POST` | `/api/admin/llm/models/:id/sync` | 手动同步价格与参数（编辑已存在行） |
| `POST` | `/api/admin/llm/models/sync-preview` | 新建未落库前预览同步结果（可选） |
| `PATCH` | `/api/admin/settings`（`llm` 字段） | 设置默认 quick / deep（产品设置键 `llm`） |
| `PUT` | `/api/admin/llm/defaults` | 同上（兼容入口） |

### 用户端

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/llm-catalog` | 开放目录 + 默认模型 |
| `POST` | `/api/analyses` | body 增加模型选择（校验后转 Core） |

### Core

- 删除定价刷新相关 HTTP/后台入口（若有）。
- 创建 job 仍接收 `llm_provider` / `quick_think_llm` / `deep_think_llm`。
- 运行时从 DB 取 Key。

## 11. 实施顺序（无兼容包袱）

1. Drizzle：建 `llm_providers`、`llm_models`（及默认配置存放方式）；**删除** `llm_pricing_sources`。
2. tg-web：管理 API + `/admin/llm/providers` / `/admin/llm/models` UI；用户 catalog + 分析选型。
3. Core：删工人与 pricing sources 代码/测试；分析路径改为 DB 读 Key；去掉产品路径对 env LLM Key 的依赖。
4. 更新文档与测试；不写迁移双读或废弃告警期。

## 12. 验收标准

- Core 启动不再访问外部定价页，库中无 `llm_pricing_sources`。
- 管理员可配置提供商 API Key（仅掩码回读），可新建/编辑模型并手动同步或手填价格与参数。
- 仅开放模型出现在用户目录；两个默认模型在未选择时生效。
- 用户提交分析后，Core 使用库内该提供商 Key 完成调用；无 Key 时失败清晰。
- 管理 API、任务 config、日志、审计中无 API Key 明文。
- **价格计算相关代码与行为与改前一致**（本需求未改结算）。

## 13. 现状锚点

| 区域 | 路径 |
|------|------|
| 待删工人 | `tg-core/api/app.py` → `start_pricing_refresh` |
| 待删/收缩刷新 | `tg-core/application/pricing.py`、`infrastructure/llm_prices.py` 中 sources 相关 |
| 待删表 | `llm_pricing_sources`（schema / drizzle / Core `_REQUIRED_TABLES`） |
| Key 现状 | `tg-core/tradingagents/llm_clients/api_key_env.py`（产品路径改为 DB） |
| 管理页 | `tg-web/src/frontend/pages/admin-models-page.tsx` |
| 加密可参考 | tg-web Stripe 密钥的 AES-GCM 配置存储 |

## 14. 已拍板（相对旧稿）

| 议题 | 结论 |
|------|------|
| 何时同步价格 | 管理员新建/编辑模型时手动同步，不是「对用户开放时自动更新」 |
| API Key | 入库加密，替代产品路径下的配置文件/环境变量 |
| 开放含义 | 用户可选用的分析模型 |
| 默认模型 | 管理员指定两个（快速 + 深度） |
| Core 职责 | 按请求读 Key 并分析；模型运营移出 Core |
| `llm_pricing_sources` | 直接删除 |
| 价格计算 | 本期不改 |
| 旧版兼容 | 不需要，直接改 |
