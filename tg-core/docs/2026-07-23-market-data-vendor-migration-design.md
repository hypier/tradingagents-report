# 美股与 A 股数据源移植设计

## 1. 目标

将 `E:\my-work2\tradingagents-ai\tradingagents-ai` 中可用于投研分析的数据源能力移植到
本工程，同时保持本工程现有的 provider-neutral 契约、ticker 规范化、日期边界校验和显式
fallback 语义。

本次范围包括：

- A 股：PandaAI、AKShare、Tushare、BaoStock。
- 美股：保留本工程现有 Yahoo Finance 和 Alpha Vantage，实现缺失的 Finnhub 在线能力，
  并允许 PandaAI 提供美股日线。
- 使用市场级环境变量控制新路由是否启用及 vendor 优先级。
- 不移植源工程的 MongoDB 缓存、后台同步任务、Web 配置管理、模拟行情或交易执行逻辑。

## 2. 源工程结论

源工程存在多套数据源编排方式，provider、`DataSourceManager`、后台同步服务和 MongoDB
配置之间有明显耦合。直接复制会带入不属于本工程的运行时依赖和不一致契约。

主要能力如下：

| Vendor | 已确认能力 | 源工程限制 |
| --- | --- | --- |
| PandaAI | A 股、港股日线和分钟线；SDK 另提供美股日线 | Agent 主链没有完整接通，部分基础信息和实时报价方法为空 |
| AKShare | A 股身份、历史行情、财务数据、个股新闻 | 依赖第三方页面和非正式接口，字段与限流策略可能变化 |
| Tushare | A 股身份、日线、估值、财务报表、新闻 | 需要 token，不同接口受积分和频率限制 |
| BaoStock | A 股身份、历史日线和部分财务指标 | 不提供真正的实时行情，新闻能力缺失 |
| Yahoo Finance | 美股历史行情、身份、基础财务数据 | 本工程已有更完整实现 |
| Alpha Vantage | 美股行情、财务、新闻、内部人数据 | 本工程已有更完整实现 |
| Finnhub | 在线 quote、公司资料、新闻；另有本地 JSON 读取 | 源工程在线与离线接口混杂，历史 OHLCV 能力不足 |

因此本次不复制源工程的总管理器，而是按本工程现有接口重新实现轻量 adapter，只注册经过
验证且与工具契约匹配的能力。

## 3. 配置模型

新增两个市场级环境变量：

```env
TRADINGAGENTS_CN_DATA_VENDORS=pandaai,akshare,tushare,baostock
TRADINGAGENTS_US_DATA_VENDORS=yfinance,alpha_vantage,finnhub
```

规则如下：

- 顺序就是 fallback 优先级。
- 未设置、空值或 `disabled` 表示不启用对应市场的新路由，保持当前默认行为。
- 未知 vendor、跨市场 vendor、重复 vendor、以及 `disabled` 与其他值混用在启动时抛出
  `ValueError`。
- 请求级 `tool_vendors` 优先于 `data_vendors`；两者存在显式值时优先于市场环境链。
- 市场链是跨能力的优先顺序。执行具体工具时，路由只保留该工具已注册的 vendor；已知但
  不支持该能力的 vendor 不会被调用，也不会导致配置错误。
- fallback 不得越过最终选定的显式链。

凭据继续使用 provider 自己的环境变量：

```env
PANDAAI_USERNAME=
PANDAAI_PASSWORD=
PANDAAI_BASE_URL=
TUSHARE_TOKEN=
FINNHUB_API_KEY=
```

AKShare 和 BaoStock 不需要本工程配置 API key。

## 4. 架构与组件

采用本工程原生 adapter 方案：

```text
tradingagents/dataflows/
  market_routing.py
  china/
    common.py
  akshare/
  tushare/
  baostock/
  pandaai/
  finnhub/
```

职责边界：

- `market_routing.py`：根据 `ListingRef` 识别 CN/US，解析和校验市场链，并按能力过滤。
- `china/common.py`：A 股 provider 共用的日期、ticker、OHLCV 列、单位和文本格式转换。
- 各 vendor 包：只处理认证、供应商代码转换、请求和响应字段映射。
- `interface.py`：继续作为唯一 vendor 注册与 fallback 入口，不嵌入 provider 专用判断。
- `provider_models.py`、`market_data_validator.py` 和 `news_utils.py`：继续提供统一输出、
  行情质量校验和新闻日期边界。

不创建新的数据库、repository、依赖注入容器或后台同步层。

## 5. 能力矩阵

| Vendor | 市场 | 注册能力 |
| --- | --- | --- |
| PandaAI | A 股、美股 | `get_stock_data`、`get_ohlcv` |
| AKShare | A 股 | 身份、行情、OHLCV、衍生技术指标、基本面、财务报表、个股新闻 |
| Tushare | A 股 | 身份、行情、OHLCV、衍生技术指标、基本面、三大财务报表、个股与市场新闻 |
| BaoStock | A 股 | 身份、行情、OHLCV、衍生技术指标、基本面 |
| Yahoo Finance | 美股 | 保留现有注册能力 |
| Alpha Vantage | 美股 | 保留现有注册能力 |
| Finnhub | 美股 | 身份、基本面、个股/市场新闻、内部人交易 |

PandaAI 不声明源 provider 中未实现的身份、新闻和财务能力。BaoStock 的最新日线不描述为
实时行情。Finnhub quote 不转换成历史 OHLCV。技术指标从对应 vendor 的已验证 OHLCV
统一计算，不复制重复指标实现。

## 6. 数据流

```text
Agent / application tool
  -> resolve_listing() / ListingRef
  -> market_routing 识别 CN 或 US
  -> tool_vendors / data_vendors / 市场环境链 / 原默认链
  -> 按工具能力过滤 vendor
  -> vendor adapter 转换供应商代码并请求
  -> 截止日期过滤和字段标准化
  -> ProviderResult 或现有文本契约
  -> market_data_validator / news date guard
  -> 显式 fallback 或返回结果
```

A 股对外输入继续使用统一格式，例如 `600519.SS`、`SSE:600519`、`000001.SZ`。adapter
内部才转换为 AKShare 的 `600519`、Tushare 的 `600519.SH` 或 BaoStock 的 `sh.600519`。
无交易所的六位数字不在路由层静默猜测市场。

PandaAI A 股日线调用 `get_market_data`，美股日线调用 `get_us_daily`。两个调用都转换成
`Date/Open/High/Low/Close/Volume`，保留 provider、解析后 ticker、币种、复权方式和
截止时间等来源元数据。

## 7. 错误处理与安全

provider 统一映射到现有错误层次：

- SDK 或凭据未配置：`VendorNotConfiguredError`。
- 配置了凭据但认证被拒绝：`VendorAuthenticationError`。
- 供应商限流：`VendorRateLimitError`。
- 空数据、过期数据或截止日前无有效记录：`NoMarketDataError`。
- 传输失败或响应不可解析：`VendorUnavailableError`。

路由只在配置链内 fallback。行情和新闻都必须在 adapter 返回前按请求截止日期过滤；历史
分析不接受未来数据，不能使用模拟数据补齐缺失值。

日志脱敏扩展覆盖 `username`、`password` 和 `authorization`。PandaAI 凭据不得进入日志、
API 响应、job 请求快照或持久化配置。错误消息可以包含 vendor 名和失败类型，但不得包含
token、密码或完整认证响应。

## 8. 依赖与许可

新增 SDK 使用可选依赖组，未启用对应市场链时不强制安装：

- A 股数据：AKShare、Tushare、BaoStock。
- PandaAI：`panda_data`。
- Finnhub：`finnhub-python`。

源工程根许可证声明 `tradingagents/` 属 Apache License 2.0，`app/` 和 `frontend/` 属专有
范围。本次只参考和改写 Apache-2.0 范围内的 provider，不复制专有目录代码，并在数据源
文档中记录来源和归属。

`panda_data` SDK、PandaAI 数据服务以及其他供应商数据不因本工程采用 Apache-2.0 而自动
获得相同授权。部署方必须自行确认服务访问、商业使用、缓存、展示和再分发权。本工程只
提供技术 adapter，不承诺或转授供应商数据许可。

## 9. 测试与验证

实现采用 TDD，单元测试不访问真实网络。测试通过注入或 monkeypatch 假 SDK 响应覆盖：

- 环境变量解析、禁用、优先级、重复项和非法值。
- CN/US 市场识别、显式工具/类别配置优先级、能力过滤和 fallback 边界。
- 各 adapter 的 ticker 转换、字段映射、空数据、认证、限流和日期边界。
- PandaAI 的 A 股 `get_market_data` 与美股 `get_us_daily` 调用契约。
- OHLCV 标准列、来源元数据、成交量/成交额单位和截止日期过滤。
- 新闻 look-ahead 防护和历史窗口内无数据语义。
- 日志与错误消息不泄露 token、用户名或密码。

重点回归测试包括：

- `tests/test_env_overrides.py`
- `tests/test_vendor_routing.py`
- `tests/test_vendor_errors.py`
- `tests/test_instrument_identity.py`
- `tests/test_symbol_normalization_paths.py`
- `tests/test_news_lookahead.py`
- `tests/test_market_data_validator.py`
- `tests/test_application_jobs.py`
- `tests/test_api_contract.py`

真实供应商连通性测试标记为 `integration`，只在部署方显式安装依赖并提供测试凭据时运行，
不作为默认单元测试的前置条件。

## 10. 文档更新

实现时同步更新：

- `README.md`：安装 extras 和最小环境变量示例。
- `tradingagents/dataflows/README.md`：能力矩阵、路由优先级和错误语义。
- `docs/ARCHITECTURE_DESIGN.md`：市场级路由和 provider 边界。
- 新增数据源配置与许可说明文档：凭据、服务条款、风险和 integration 测试方法。

本次不改变 HTTP job 状态机、PostgreSQL schema、worker 并发模型或 LangGraph checkpoint
语义。
