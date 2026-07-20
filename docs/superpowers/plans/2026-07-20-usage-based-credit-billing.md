# 积分计费与管理员额度调整实现计划

> **面向 AI 代理的工作者：** 使用 superpowers:executing-plans 在当前会话逐任务实现；每一步遵循 TDD。仓库 AGENTS.md 禁止未授权创建分支和 commit，因此在当前工作区执行且不提交。

**目标：** 将固定 1 额度分析计费改为按历史成本预估预扣、按实际 AI token 美元成本加价结算，并提供管理员计费设置和用户积分人工增减界面。

**架构：** TG-web 负责计费配置、P90 估价、预扣和管理员操作；Core 在 job 终态事务中使用预留快照完成多退少补或失败释放。PostgreSQL 是配置、钱包、预留、账本和 job 的唯一持久化来源。

**技术栈：** TypeScript、Hono、Drizzle ORM、React Query、shadcn/ui、Vitest、Python、psycopg、pytest、PostgreSQL、Docker Compose。

---

### 任务 1：计费数学、数据契约与 Drizzle schema

**文件：**
- 创建：`tg-web/src/backend/billing/credit-pricing.ts`
- 创建：`tg-web/tests/unit/credit-pricing.test.ts`
- 修改：`tg-web/src/backend/database/schema.ts`
- 修改：`tg-web/tests/unit/schema.test.ts`
- 生成：`tg-web/drizzle/0002_*.sql`
- 生成：`tg-web/drizzle/meta/*`

- [ ] 先写计费公式测试，覆盖默认冷启动预扣 132、实际成本 0.123 扣 14、零成本扣 0、P90 和签名稳定性。
- [ ] 运行 `pnpm test:unit -- tests/unit/credit-pricing.test.ts`，确认因模块缺失失败。
- [ ] 实现十进制定点输入的 `calculateReservedPoints()`、`calculateActualPoints()`、`discreteP90()` 和 `buildBillingSignature()`。
- [ ] 先扩展 schema 测试，断言计费设置、审计表和预留结算字段存在并确认失败。
- [ ] 扩展 schema：`credit_billing_settings`、`credit_billing_setting_events`，以及 reservation 的成本、快照和结算字段。
- [ ] 运行 `pnpm db:generate` 生成迁移，检查默认值、nullable 兼容和外键。
- [ ] 运行两个单元测试文件确认通过。

### 任务 2：计费仓库、历史估价、动态预扣与人工调整

**文件：**
- 修改：`tg-web/src/backend/database/billing-repository.ts`
- 修改：`tg-web/src/backend/database/repositories.ts`
- 修改：`tg-web/src/backend/database/client.ts`
- 修改：`tg-web/tests/integration/database.test.ts`

- [ ] 写集成测试：默认/更新设置与审计、同签名 P90、无样本回退、动态预扣快照、取消订阅门槛、余额不足、批量余额读取、人工正负调整与幂等冲突。
- [ ] 运行数据库集成测试，确认新仓库 API 缺失导致失败。
- [ ] 新增 `CreditBillingSettingsRepository`，在事务中读取默认设置、更新设置并追加审计事件。
- [ ] 将 `reserveAnalysis()` 输入改为计费签名，事务内估价、计算预扣、保存快照并写 reserve 流水；删除有效订阅查询。
- [ ] 新增只读 `estimateAnalysis()`、`getAvailableCredits(userIds)` 和幂等 `adjustCredits()`。
- [ ] 运行数据库集成测试确认通过。

### 任务 3：Web API 与客户端契约

**文件：**
- 修改：`tg-web/src/backend/billing/contract.ts`
- 修改：`tg-web/src/backend/auth/contract.ts`
- 修改：`tg-web/src/backend/routes/analyses.ts`
- 修改：`tg-web/src/backend/routes/admin.ts`
- 修改：`tg-web/src/backend/routes/billing.ts`
- 修改：`tg-web/src/backend/app.ts`
- 修改：`tg-web/tests/unit/app.test.ts`
- 修改：`tg-web/tests/unit/contracts.test.ts`

- [ ] 写 API 测试：估价响应、创建时服务端重新估价、402 不调用 Core、管理员读写计费设置、列表合并积分、人工调整、普通用户 403 和输入错误。
- [ ] 运行 `pnpm test:unit -- tests/unit/app.test.ts tests/unit/contracts.test.ts`，确认失败原因是路由/契约缺失。
- [ ] 新增估价端点和动态 reserve 调用，保持 `request_id` 幂等。
- [ ] 管理员用户列表批量合并余额；调整前从 Clerk 读取并同步目标本地用户。
- [ ] 新增计费设置 GET/PUT，严格校验比率、基点和默认成本范围。
- [ ] 映射余额不足、幂等冲突等领域错误为 400/402/409。
- [ ] 运行 API/契约测试确认通过。

### 任务 4：Core 按实际成本原子结算

**文件：**
- 修改：`tg-core/infrastructure/analysis_jobs.py`
- 修改：`tg-core/tests/test_infrastructure_analysis_jobs.py`

- [ ] 写 pytest 用例：预扣多退、补扣、补扣形成负余额、零成本、失败全退、旧预留固定 units 兼容、重复终态不重复结算。
- [ ] 运行 `pytest tests/test_infrastructure_analysis_jobs.py`，确认现有固定核销行为导致断言失败。
- [ ] 使用 `Decimal` 和 `ROUND_CEILING` 从 reservation pricing snapshot 计算实际积分。
- [ ] 成功时原子更新 `available += reserved - actual`、`reserved -= reserved`、`spent += actual`；失败全额释放。
- [ ] 更新 reservation 的 settled 字段，并把完整成本换算快照写入账本 metadata。
- [ ] 无 snapshot 的旧预留继续按 units 消费。
- [ ] 运行专项 pytest 确认通过。

### 任务 5：管理员计费设置与用户人工调点 UI

**文件：**
- 修改：`tg-web/src/frontend/lib/billing.ts`
- 修改：`tg-web/src/frontend/lib/auth.ts`
- 修改：`tg-web/src/frontend/pages/admin-billing-page.tsx`
- 修改：`tg-web/src/frontend/pages/admin-users-page.tsx`
- 修改：`tg-web/tests/unit/billing-pages.test.tsx`
- 修改：`tg-web/tests/unit/admin-users-page.test.tsx`
- 修改：`tg-web/src/frontend/i18n/locales/en/admin.json`
- 修改：`tg-web/src/frontend/i18n/locales/zh/admin.json`

- [ ] 使用 shadcn CLI 查看 Dialog、Tabs、Field、ToggleGroup 文档并核对当前 Radix API。
- [ ] 写页面测试：积分设置读取/保存/预览；用户余额列；调整 Dialog；增加/扣减；余额不足禁用；成功刷新。
- [ ] 运行两个页面测试，确认控件缺失导致失败。
- [ ] 管理员支付页新增“积分计费”标签页，使用 FieldGroup、Field、Input、Card 和 Spinner。
- [ ] 用户页新增余额/操作列和 Dialog；增加/扣减用 ToggleGroup，提交期间禁止重复请求。
- [ ] 增加中英文文案和 toast。
- [ ] 运行页面测试确认通过。

### 任务 6：分析预估提示、账单明细与默认套餐

**文件：**
- 修改：`tg-web/src/frontend/pages/home-page.tsx`
- 修改：`tg-web/src/frontend/pages/billing-page.tsx`
- 修改：`tg-web/src/frontend/lib/billing.ts`
- 修改：`tg-web/src/backend/billing/default-plans.ts`
- 修改：`tg-web/src/backend/billing/stripe-billing.ts`
- 修改：`tg-web/tests/unit/frontend-app.test.tsx`
- 修改：`tg-web/tests/unit/billing-pages.test.tsx`
- 修改：`tg-web/tests/unit/stripe-plan-provisioning.test.ts`
- 修改：`tg-web/src/frontend/i18n/locales/en/home.json`
- 修改：`tg-web/src/frontend/i18n/locales/zh/home.json`
- 修改：`tg-web/src/frontend/i18n/locales/en/billing.json`
- 修改：`tg-web/src/frontend/i18n/locales/zh/billing.json`

- [ ] 写测试：有效分析表单显示预计预扣；账本显示实际美元成本和最终积分；默认套餐发放 2000/5000/10000。
- [ ] 运行相关单元测试确认失败。
- [ ] 前端调用估价端点，只做展示；创建分析仍由服务端重新估价。
- [ ] 扩展 BillingOverview ledger 合同以返回成本换算 metadata，并在账单页展示。
- [ ] 更新默认套餐及 Stripe 调和逻辑的积分 metadata。
- [ ] 运行相关单元测试确认通过。

### 任务 7：文档、全量验证、迁移与 Docker 部署

**文件：**
- 修改：`tg-web/docs/PRODUCT_FUNCTIONS.md`
- 修改：`tg-web/README.md`
- 修改：`tg-core/docs/API_SERVICE.md`
- 修改：`tg-core/docs/ARCHITECTURE_DESIGN.md`
- 修改：`docker/Dockerfile.web`（若迁移镜像仍缺少 drizzle 目录）

- [ ] 更新真实实现边界、计费公式、API、迁移和部署顺序。
- [ ] 运行 Web unit 测试、数据库 integration 测试、Core 专项测试。
- [ ] 运行 `pnpm typecheck`、`pnpm lint`、`pnpm build`、`pnpm build:node`。
- [ ] 运行 Core 相关 pytest、py_compile 和 Ruff。
- [ ] 运行 `git diff --check` 并审查所有变更。
- [ ] 构建 Core/Web 本机镜像，启动 PostgreSQL，执行 Drizzle 迁移，再重建应用容器。
- [ ] 验证 Compose 四服务、Core `/health`、Web `/api/ready`、首页和近期日志。
