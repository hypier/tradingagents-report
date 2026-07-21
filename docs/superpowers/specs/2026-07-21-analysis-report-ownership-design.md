# 分析报告账户隔离设计

## 目标

- 普通用户只能查看自己账户创建的分析任务、报告正文和进度事件。
- 管理员可以查看全部用户以及无账户归属的分析任务、报告和事件日志。
- 跨账户读取返回 404，不暴露任务是否存在。
- 保持 Core API 的服务间认证边界；Core 不处理 Clerk 会话或角色。

## 现状与问题

TG-web 的 `GET /api/analyses`、`GET /api/analyses/:id` 和
`GET /api/analyses/:id/events` 当前直接代理 Core 的全局查询。虽然这些
TG-web 路由要求 Clerk 会话，但查询没有加入当前用户条件，因此任意登录用户
都可以看到全局列表，并可通过任务 ID 读取其他账户的报告和事件。

分析提交前，TG-web 已在 `credit_reservations` 中保存
`request_id -> clerk_user_id`；同一 `request_id` 会传给 Core 并保存到
`analysis_jobs.request_id`。该关系已经具备主键、用户外键和请求幂等约束，
可直接作为分析任务的账户所有权来源。

## 方案

采用现有积分预留记录作为所有权索引，不在 `analysis_jobs` 重复增加 Clerk
用户字段。

Core 的任务读取方法增加可选 `owner_id`：

- `owner_id` 为空时保持全局查询，供管理员和受信任的内部调用使用。
- `owner_id` 非空时，任务必须存在匹配的 `credit_reservations` 行，且
  reservation 的 `request_id` 与 job 的 `request_id` 相同、
  `clerk_user_id` 与 `owner_id` 相同。
- 列表在 SQL 层先按 owner 过滤，再执行 ticker、status、排序和分页，避免
  BFF 过滤造成数据泄露或分页缺项。
- 详情和事件使用相同所有权条件；不存在或不属于调用者都返回 404。

`credit_reservations.analysis_job_id` 仍用于结算关联，但读取授权使用稳定的
`request_id` 关系。这样即使提交成功后关联 job ID 的辅助更新失败，任务仍然
属于原始预留账户。

## 请求流程

TG-web 的分析读取路由从认证上下文取得 `authUser.role`：

1. 普通用户将当前 Clerk `userId` 作为内部 owner scope 传给
   `CoreClient`。
2. 管理员传递空 scope，获得全局结果。
3. 客户端请求中的 `owner_id`、`userId` 或同类查询参数不会被转发，
   用户不能选择或覆盖 owner scope。
4. `CoreClient` 仅在 scope 非空时追加内部 `owner_id` 查询参数。
5. Core API 将 scope 传给 PostgreSQL 仓储查询。

分析创建流程不变：TG-web 仍先预留积分，再使用同一 `request_id` 提交 Core。
提交响应只返回当前请求新建或幂等复用的任务，不需要额外读取授权。

## 数据与历史兼容

不新增表或迁移：

- 现有经 TG-web 创建并带有 credit reservation 的任务自动归属原账户。
- CLI、程序化入口或直接 Core API 创建且没有 reservation 的任务视为无账户
  归属，只能由管理员通过 TG-web 或受信任的 Core 内部调用查看。
- 已释放或已消费的 reservation 仍保留所有权；授权不依赖 reservation 状态。
- 删除产品用户时现有外键会级联删除 reservation，相关历史任务随后仅管理员
  可见，不会转移给其他账户。

## 安全边界

- Clerk 身份和管理员角色只在 TG-web 验证。
- Core 的 `owner_id` 是服务间过滤参数，不是终端用户身份凭证；Core API
  继续要求内部 API key。
- TG-web 必须对列表、详情和事件三个入口统一计算 scope，避免只隐藏列表但仍
  可猜测 ID 读取详情。
- 越权和不存在使用相同 404 响应，避免任务枚举。
- 市场搜索、市场快照、积分账单和管理员接口不受本功能影响。

## 错误处理

- 普通用户读取其他账户任务时，Core 返回 404，TG-web 保留为 404，而不是
  转换为 503。
- Core 无法连接数据库或 TG-web 无法连接 Core 时继续使用现有 503 语义。
- owner scope 只接受非空、长度受限的字符串；TG-web 传入 Clerk user ID，
  不接受浏览器提供的 owner 值。

## 测试

### TG-web 单元测试

- 普通用户列表请求向 CoreClient 传入当前用户 scope。
- 普通用户详情和事件请求使用当前用户 scope。
- 管理员三个读取入口都使用全局 scope。
- 查询字符串中的伪造 owner 参数不能覆盖认证 scope。
- Core 404 保持为 BFF 404。

### Core API 与基础设施测试

- 两个用户各有任务时，owner 列表只返回自己的任务。
- ticker、status、limit 和 offset 在 owner 过滤后生效。
- owner 可以读取自己的详情和事件。
- owner 读取其他用户或无归属任务返回 404。
- 管理员/空 scope 可以读取所有任务及事件。
- released、consumed 和 reserved 三种 reservation 状态都能证明所有权。

### 回归验证

- 现有任务创建、幂等 request ID、worker 执行和积分结算测试保持通过。
- TG-web unit、integration、worker、lint、typecheck 和生产构建保持通过。
- Docker 迁移不新增版本；重建镜像后验证普通用户 404 与管理员全局访问。

## 非目标

- 不允许普通用户共享、转移或公开报告。
- 不新增管理员按用户筛选界面；管理员仍查看现有全局列表。
- 不改变 Core CLI 和程序化图入口。
- 不删除历史无归属任务。
