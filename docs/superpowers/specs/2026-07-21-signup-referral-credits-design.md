# 新用户赠送与邀请奖励设计

## 目标

为产品增加一次性新用户赠送和可重复邀请奖励：

- 新用户首次进入应用时获得默认 5 美元等值积分。
- 免费额度不续期、不创建 Stripe 订阅，积分用完即止。
- 每个用户获得一个长期有效的固定邀请链接。
- 每成功邀请一个新用户，邀请人获得默认 2 美元等值积分；邀请次数不设上限。
- 管理员可以分别设置新用户赠送金额和邀请人奖励金额。

## 已确认规则

- “注册成功”以 Clerk 用户完成注册并首次进入本应用、后端成功同步本地账户为准。
- 每个被邀请用户最多绑定一个邀请人，首次有效归因不可更改。
- 只有尚未完成首次进入结算的新用户可以产生邀请奖励。
- 禁止自邀；邀请码无效、邀请人已删除或被邀请者不符合条件时，不发邀请奖励。
- 邀请关系只奖励一次；邀请人可以邀请多个不同新用户并分别获得奖励。
- 金额设置只影响之后完成首次进入结算的用户，不追溯、不补差。

## 方案选择

采用“后端邀请入口 + HttpOnly 归因 Cookie + 首次进入事务结算”。

邀请链接形如 `https://<site>/invite/<referral-code>`。后端校验邀请码后写入 30 天有效的 `HttpOnly`、`SameSite=Lax` Cookie，在 HTTPS 环境增加 `Secure`，随后跳转至 `/sign-up`。这种方式不依赖 Clerk webhook，且邀请归因可以跨越 Clerk 注册跳转。

未采用的方案：

- 前端 `localStorage`：依赖前端调用和浏览器存储，归因可靠性较弱。
- Clerk metadata + webhook：增加外部 webhook 配置、重试语义和 Clerk 耦合，不符合“首次进入应用时结算”的确认规则。

## 数据模型

### 计费设置

扩展 `credit_billing_settings`：

- `signup_grant_usd numeric(18, 2) not null default '5.00'`
- `referral_reward_usd numeric(18, 2) not null default '2.00'`

两个字段均为非负美元金额，最多两位小数。值为 `0` 时关闭对应奖励。设置变更沿用 `credit_billing_setting_events` 审计事件，前后快照包含新增字段。

### 用户与首次结算

扩展 `product_users`：

- `referral_code text`：随机、不可预测、唯一、长期有效。
- `onboarding_completed_at timestamptz`：首次进入应用的原子结算标记。

迁移时为所有现有 `product_users` 回填唯一邀请码和 `onboarding_completed_at`，避免历史用户在功能上线后领取新用户赠送。迁移完成后 `referral_code` 为非空；此后新建本地用户时直接生成唯一邀请码。

管理员为了查看或调整积分而预先同步的 Clerk 用户不设置 `onboarding_completed_at`，该用户首次亲自进入应用时仍可领取新用户赠送。

### 邀请关系

新增 `referral_relationships`：

- `invitee_clerk_user_id`：主键及外键，保证每个新用户最多一个邀请人。
- `inviter_clerk_user_id`：邀请人外键。
- `referral_code`：结算使用的邀请码快照。
- `signup_grant_usd`、`signup_grant_points`：新用户赠送快照。
- `referral_reward_usd`、`referral_reward_points`：邀请奖励快照。
- `points_per_usd`：结算时汇率快照。
- `created_at`：结算时间。

邀请人和被邀请人必须不同。表级唯一约束、外键与应用事务共同维持关系完整性。

### 积分账本

继续使用 `credit_accounts` 和 `credit_ledger_entries` 作为积分权威，不创建免费 Stripe subscription。

- 新用户赠送幂等键：`signup:<inviteeUserId>:grant`
- 邀请人奖励幂等键：`referral:<inviteeUserId>:reward`
- 两类流水的 `entry_type` 使用现有 `grant`。
- `reference_type` 分别使用 `signup_grant` 和 `referral_reward`。
- metadata 保存美元金额、汇率、换算积分、邀请码以及邀请双方用户 ID。

## 领域边界与事务

新增 onboarding/邀请持久化职责，避免把奖励逻辑散落在 Clerk 适配器或前端。

认证中间件在验证 Clerk session 并取得用户资料后调用首次进入结算。单个 PostgreSQL 事务完成：

1. upsert `product_users` 并确保 `credit_accounts` 存在。
2. 为用户确保存在唯一 `referral_code`。
3. 锁定用户行并检查 `onboarding_completed_at`。
4. 读取当前 `credit_billing_settings`。
5. 按美元金额和 `points_per_usd` 计算整数积分。
6. 幂等写入新用户赠送账本并增加新用户余额。
7. 若 Cookie 邀请码有效，校验非自邀，创建邀请关系，幂等写入奖励账本并增加邀请人余额。
8. 设置 `onboarding_completed_at` 并提交事务。

任一步骤失败则整个事务回滚，下次受保护请求可以安全重试。并发请求通过用户行锁、邀请关系主键和账本幂等键保证最多结算一次。

普通资料同步与首次进入结算保持不同语义：管理员同步目标用户只更新本地资料，不提前领取奖励；真正的认证请求才执行 onboarding。

## 金额换算

新用户赠送和邀请奖励按结算时的 `points_per_usd` 换算并向上取整：

`points = ceil(amount_usd * points_per_usd)`

不叠加分析任务使用的 markup 或 reserve buffer。金额为 `0` 时不创建零金额账本流水，但仍完成首次进入标记和有效邀请关系记录，保证配置变化后不追溯补发。

计算复用精确十进制/BigInt 路径，拒绝负数、超过两位小数以及超出 JavaScript 安全整数范围的结果。

## HTTP 流程

### 公开邀请入口

`GET /invite/:code`

- 有效邀请码：设置归因 Cookie，返回 `302 /sign-up`。
- 无效邀请码：不设置 Cookie，返回 `302 /sign-up?invite=invalid`。
- Node 与 Cloudflare 运行入口都将 `/invite/` 路径交给 Hono，而不是 SPA 静态回退。

邀请 Cookie 只保存邀请码，不保存用户 ID或金额。首次认证请求完成 onboarding 事务且受保护请求成功后清除 Cookie；事务或后续请求失败时保留 Cookie，以便下一次请求重试归因。

### 用户邀请信息

`GET /api/account/referral`

返回：

- 当前用户的相对邀请路径或完整邀请链接。
- 成功邀请人数。
- 累计邀请奖励积分。

接口只统计已经写入 `referral_relationships` 的成功邀请。

### 管理员设置

扩展现有接口：

- `GET /api/admin/billing/credit-settings`
- `PUT /api/admin/billing/credit-settings`

请求和响应增加 `signupGrantUsd` 与 `referralRewardUsd`。继续使用现有管理员鉴权和设置审计流程。

## 前端设计

### 账户页

增加一个独立邀请区域：

- 只读邀请链接。
- 带复制图标的复制按钮和成功/失败 toast。
- 成功邀请人数。
- 累计邀请奖励积分。

链接和统计采用独立查询，不扩大账户偏好更新接口的职责。

### 管理员计费页

在“积分”标签页增加：

- 新用户赠送金额（USD）。
- 邀请人奖励金额（USD）。
- 按当前 `points_per_usd` 计算的积分预览。

保存时与现有积分计费设置一次提交、一次审计。中英文文案同步更新。

### 用户账单页

不显示虚构的免费订阅。一次性赠送和邀请奖励通过余额及账本展示，流水说明分别为“新用户注册赠送”和“邀请注册奖励”。

## 异常处理

- 无效或已失效的邀请码不阻止注册，只跳过邀请奖励。
- 邀请人账户不存在、自邀、被邀请者已完成首次结算时不创建奖励。
- 配置金额或汇率非法时拒绝管理员更新；若数据库中出现非法配置，首次结算失败并回滚，不静默发放错误积分。
- 随机邀请码碰撞时重试生成；有限次数后仍失败则回滚并记录错误。
- Cookie 清理在认证响应阶段执行；数据库事务失败时仍允许保留 Cookie，以便下一次请求重试归因。

## 测试与验证

### 单元测试

- 美元金额到积分的精确换算、向上取整、零金额和溢出。
- 管理员设置 schema 的默认值与校验。
- 邀请入口的有效/无效跳转及 Cookie 属性。
- 认证中间件传递邀请归因并按结算结果清理 Cookie。
- 账户邀请 API 与管理员配置 API 权限和契约。
- 账户页复制链接/统计与管理员金额表单。

### PostgreSQL 集成测试

- 无邀请的新用户首次赠送。
- 有效邀请同时发放新用户赠送和邀请人奖励。
- 重复请求、并发请求和事务重试不重复发放。
- 一个被邀请用户只能绑定一个邀请人。
- 邀请人可以邀请多个不同用户并重复获奖。
- 自邀、无效邀请码、已完成首次结算用户不产生奖励。
- 历史用户迁移后不补发。
- 零金额配置记录结算但不写零值账本。
- 设置更新审计包含新增金额字段。

### 运行时与构建验证

- Node 和 Cloudflare 两种入口都正确处理 `/invite/:code`。
- `pnpm typecheck`、相关 unit/integration tests、`pnpm build` 和 `pnpm build:node`。
- Docker 镜像重建、Drizzle 迁移、Compose readiness 和邀请重定向 smoke test。

## 非目标

- 不实现邀请奖励提现、层级分销、排行榜或邀请活动期限。
- 不创建免费 Stripe Customer、Checkout、Invoice 或 Subscription。
- 不允许一个新用户拆分或更改邀请归因。
- 不为历史用户追溯发放新用户赠送或邀请奖励。
