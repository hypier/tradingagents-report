# TradingView 一级数据源集成设计

日期：2026-07-11

## 1. 目标

将 RapidAPI `tradingview-data1` 作为项目现有市场数据能力的一级数据源，并将 Yahoo Finance 调整为回退或专项数据源。同时移除业务层对 Yahoo/yfinance 的直接依赖，使数据源选择、标的解析、结果校验和回退策略集中在数据层。

本次改造必须满足：

- 默认使用显式、可配置的能力优先级，而不是依赖 Python 字典插入顺序。
- 未配置 TradingView key 的部署继续正常运行，并自动回退到后续数据源。
- 现有 Agent 工具的函数签名及字符串/Markdown 输出契约保持兼容。
- TradingView、Yahoo 和 Alpha Vantage 的 symbol 规则只存在于各自 resolver/adapter 内。
- 市场快照、标的身份、收益率与基准收益不再绕过 provider 路由直连 Yahoo。
- 返回第一个通过能力校验的结果，而不是第一个未抛异常的结果。

## 2. 第一阶段范围

第一阶段覆盖当前已经存在的能力：

- 标的搜索与身份解析
- OHLCV 历史行情
- 市场快照
- 技术指标
- 基本面摘要
- 资产负债表、现金流量表、利润表
- 公司新闻与全球新闻
- 内幕交易
- 标的收益率与基准收益率

第一阶段不增加新的 Agent 工具，不接入 TradingView 选股器、经济日历、流式行情、社区观点或聚合 TA 评级，不做多数据源字段融合，也不迁移 Agent 提示词或报告输出结构。

## 3. 当前问题

现有 `dataflows/interface.py` 已支持按方法和类别配置供应商，并按逗号分隔顺序回退，但仍有以下结构性问题：

- `market_data_validator.py` 通过 `stockstats_utils.load_ohlcv()` 固定从 Yahoo 读取行情。
- `agents/utils/agent_utils.py` 通过 `yf.Ticker()` 固定解析标的身份。
- `graph/trading_graph.py` 通过 `yf.Ticker().history()` 固定计算标的和基准收益。
- `symbol_utils.normalize_symbol()` 实际输出 Yahoo symbol，却被当作通用 symbol 规范化函数使用。
- `sentiment_analyst.py` 将已通过 provider 路由取得的新闻固定标注为 Yahoo Finance。
- `default` 路由顺序来自 `VENDOR_METHODS` 的插入顺序；`VENDOR_LIST` 并不控制真实优先级。
- 路由将任意正常返回视为成功，无法拒绝空、畸形、过期或语义不符的数据。

## 4. 架构

数据流如下：

```text
用户输入 symbol
  -> InstrumentRef
  -> Provider Symbol Resolver
  -> Capability Policy
  -> 有序 Provider Adapter 链
  -> 能力校验
  -> ProviderResult[T]
  -> 兼容格式化层
  -> 现有 Agent / 报告 / 图执行路径
```

### 4.1 分层职责

`InstrumentRef` 只描述与供应商无关的标的身份。`canonical_symbol` 仅做空白、大小写和输入别名清理，不包含交易所前缀、Yahoo 后缀或其他供应商编码；它不保存 Yahoo 风格的“全局规范 symbol”。

Provider symbol resolver 将 `InstrumentRef` 转换为供应商自己的标识，例如黄金连续期货在 TradingView 使用 `COMEX:GC1!`，在 Yahoo 使用 `GC=F`。

Capability policy 根据方法级配置和类别级配置产生严格有序的 provider 链。方法级 `tool_vendors` 继续覆盖类别级 `data_vendors`。

Provider adapter 负责调用供应商、解析响应并生成对应能力的标准化数据。Router 只负责执行顺序、错误分类和回退，不包含供应商字段映射。

兼容格式化层把标准化数据转换成现有工具需要的字符串或 Markdown。业务调用方不需要知道实际供应商。

### 4.2 内部数据契约

内部新增以下概念，具体可使用 dataclass、TypedDict 或项目现有类型风格实现：

```text
InstrumentRef
  raw_symbol
  canonical_symbol
  asset_class
  exchange_hint
  currency_hint

ProviderSymbol
  provider
  symbol
  exchange
  resolution_source

ProviderResult[T]
  data
  provider
  requested_symbol
  resolved_symbol
  as_of
  delay
  adjustment_mode
  provenance
```

`ProviderResult` 是内部契约，不直接返回给 Agent。`provenance` 只保存非敏感的 endpoint、请求语义和响应元数据，禁止包含 API key 或完整认证 header。

## 5. 默认能力策略

| 能力 | 默认数据源链 | 说明 |
|---|---|---|
| 标的搜索与身份 | `tradingview,yfinance` | 生成统一身份与 provider symbol |
| OHLCV / 市场快照 | `tradingview,yfinance,alpha_vantage` | TradingView 强制普通 Japanese candles |
| 技术指标 | `technical_indicators` 配置的 provider 链提供 OHLCV + 本地计算 | 不混入 TradingView 聚合 TA 评级 |
| 基本面与三张财务报表 | `tradingview,yfinance,alpha_vantage` | 标准化后使用现有格式化输出 |
| 公司新闻与全球新闻 | `tradingview,yfinance,alpha_vantage` | 保留回测日期边界和防前视规则 |
| 内幕交易 | `yfinance,alpha_vantage` | TradingView 当前没有等价交易明细契约 |
| 标的与基准收益率 | 复用 OHLCV provider 链 | graph 层不再直接使用 yfinance |
| 美国宏观 | `fred` | 本次不改变 |
| 预测市场 | `polymarket` | 本次不改变 |

默认配置必须显式写出上述顺序。`default` 不再通过实现注册顺序隐式决定优先级；如继续支持该哨兵值，它必须解析到显式的 capability default policy。

用户显式配置的 provider 链仍是完整边界：路由不得调用链外供应商。例如配置 `yfinance` 时，即使 Yahoo 无数据，也不能自动调用 TradingView 或 Alpha Vantage。

## 6. TradingView 适配

### 6.1 客户端

低层 `TradingViewClient` 只负责：

- Base URL `https://tradingview-data1.p.rapidapi.com`
- RapidAPI headers
- 超时和 HTTP 状态处理
- JSON 解码
- 将网络、认证、限流和响应格式问题转换为统一 provider 错误

应用运行时优先读取 `TRADINGVIEW_RAPIDAPI_KEY`，并兼容读取 `RAPIDAPI_KEY`。未配置 key 属于可回退状态，只在 debug 级别记录；认证失败、限流和服务异常记录不含凭据的 warning。

保存在集成 skill 目录中的 `.rapidapi-key` 仅用于开发查询脚本，不作为生产应用的隐式配置来源。

### 6.2 Endpoint 映射

- 标的搜索：`GET /api/search/market/{query}`
- 当前报价：`GET /api/quote/{symbol}`，用于身份和市场快照补充
- OHLCV：`GET /api/price/{symbol}`
- 基本面和财务数据：`GET /api/market-data/{symbol}/...`
- 新闻：`GET /api/news/...` 及新闻详情 endpoint

OHLCV 请求必须显式传入 `type=Japanese`，不得依赖服务默认值。否则默认 Heikin-Ashi 会改变开高低收并造成静默数据错误。

### 6.3 Symbol 解析

通用入口先进行无供应商语义的清理与分类，再由 provider resolver 独立转换：

- TradingView 使用 `EXCHANGE:TICKER`。
- Yahoo 使用其后缀、`=F`、`=X`、指数前缀等约定。
- Alpha Vantage 使用其 API 对应的 symbol 约定。

TradingView resolver 优先使用确定性本地映射处理已知格式和主要市场，再在必要时调用搜索 endpoint。搜索结果按精确 ticker、资产类型、交易所提示和主上市状态确定性排序；不得简单取第一个模糊结果。

连续期货需要单独映射。已知黄金连续合约使用 `COMEX:GC1!`，不能把搜索返回但不可报价的 `COMEX:GC` 当作成功解析结果。解析后的 symbol 必须经过目标能力验证；能被搜索到不代表能被报价或拉取 K 线。

现有 `normalize_symbol()` 在兼容期内保留为 Yahoo resolver 的兼容包装，并标明其供应商语义。新业务代码不得将其作为跨供应商 canonicalizer。

## 7. 技术指标

现有技术指标名称和输出保持不变。实现上将 OHLCV 加载与指标计算拆开：

- `technical_indicators` 类别和 `get_indicators` 方法级配置继续决定 provider 顺序，不会被 `core_stock_apis` 的配置隐式覆盖。
- provider adapter 提供经过校验的标准 OHLCV。
- 共享本地指标计算器消费标准 OHLCV。
- TradingView 和 Yahoo 不再各自拥有一套指标公式。
- Alpha Vantage 如保留远程指标 endpoint，也必须先适配到同一指标契约；不能让调用方依赖供应商特有字段。

TradingView `/api/ta` 的 Buy/Sell 聚合评级属于独立能力，不替代 RSI、MACD 等当前指标，也不在第一阶段接入。

## 8. 结果校验与回退

路由依次调用配置链，并只接受通过能力校验的结果。以下情况继续尝试下一个 provider：

- key 未配置、认证失败或限流
- 网络错误或供应商暂时不可用
- symbol 无覆盖或目标 endpoint 不支持解析后的 symbol
- 响应为空、缺少必需字段或无法解析
- OHLCV 无有效行、日期范围不满足请求或最新数据超过允许新鲜度
- 财务报表或新闻响应无法满足该能力的最低契约

校验规则按能力定义，不能只检查 truthiness。OHLCV 至少校验时间、OHLC 和成交量字段、时间顺序、数值有效性与新鲜度；新闻至少校验标题、来源/链接和发布时间，并继续执行历史分析的截止日期过滤。

整条链失败时，保持现有外部行为：有明确无数据结论时返回既有 `NO_DATA` 文本；只有供应商错误时抛出/返回现有路由所规定的错误。日志必须保留每次回退的 provider、method 和非敏感原因，避免后备数据掩盖主数据源故障。

不做多数据源融合。一个能力调用的最终结果来自一个 provider；不同能力可以按各自策略来自不同 provider。

## 9. 现有硬编码迁移

### 9.1 市场快照

`market_data_validator.py` 改为调用内部 OHLCV/quote 数据服务。`stockstats_utils` 只保留纯指标计算和 Yahoo adapter 所需逻辑，不再作为通用行情入口。

### 9.2 标的身份

`resolve_instrument_identity()` 改为调用 identity capability，默认 `TradingView -> Yahoo`。返回给 graph state 的 `instrument_context` 结构保持兼容。

### 9.3 收益率与基准

`TradingAgentsGraph._fetch_returns()` 使用标准 OHLCV 服务同时获取目标和基准数据。基准选择逻辑可保留，但基准 symbol 先表示为 `InstrumentRef`，再由当前 provider resolver 转换。

### 9.4 文案

Sentiment/news prompt 不再固定写“Yahoo Finance”。使用中性的“market news data”，或由非敏感 provenance 动态标注实际来源，但不得改变现有结构化输出契约。

## 10. 兼容性与配置

- 现有 Agent tool 名称、参数和字符串/Markdown 返回格式保持不变。
- `tool_vendors` 继续覆盖 `data_vendors`。
- 逗号分隔的 provider 顺序继续表示严格回退顺序。
- 没有 TradingView key 时，默认链安静跳过 TradingView，现有部署自动使用 Yahoo/Alpha Vantage。
- Yahoo adapter 内部继续允许使用 yfinance；禁止的是业务层和通用层直接依赖 yfinance。
- FRED、Polymarket 和与本次无关的 provider 行为不变。

## 11. 测试设计

### 11.1 TradingView 契约单测

- 使用 HTTP mock 验证 endpoint、header、query 参数、超时和 JSON 解析。
- 验证 OHLCV 请求始终显式包含 `type=Japanese`。
- 覆盖成功、401/403、429、5xx、超时、非法 JSON、空数据和字段缺失。
- 验证日志和异常文本不包含 API key。

### 11.2 Symbol 测试

覆盖美股、港股、A 股、加密货币、外汇、指数和连续期货，包括：

- `NASDAQ:AAPL`
- `HKEX:700`
- `SSE:600519`
- `BINANCE:BTCUSDT`
- `OANDA:EURUSD`
- `SP:SPX`
- `COMEX:GC1!`

同时测试模糊搜索排序、不可报价搜索结果被拒绝，以及同一 `InstrumentRef` 在不同 provider 下得到不同 symbol。

### 11.3 路由测试

- TradingView 成功时不调用后续 provider。
- 未配置 key、认证失败、限流、无数据、畸形或过期结果时按顺序回退。
- `tool_vendors` 覆盖类别配置。
- 显式链之外的 provider 永不调用。
- `default` 使用 capability policy，而不是 `VENDOR_METHODS` 插入顺序。
- 所有 provider 均失败时保持现有 `NO_DATA` 和异常优先级语义。

### 11.4 回归测试

- 市场快照、标的身份和收益率测试不再 patch `yf.Ticker` 或 Yahoo 专用 loader。
- 现有 Agent 输出格式保持不变。
- 新闻防前视和日期边界保持不变。
- OHLCV 过期检测和 symbol 安全处理保持不变。
- Alpha Vantage、FRED 和 Polymarket 现有测试继续通过。

### 11.5 可选实时测试

实时 TradingView 测试必须使用显式 pytest marker，并且只在 key 存在时运行。普通 CI 不依赖外部网络。实时测试只验证少量代表性标的和响应契约，不消耗完整分析流程。

## 12. 完成标准

- 默认能力链以 TradingView 为 OHLCV、身份、基本面、财务和新闻的一级数据源。
- 缺少 TradingView key 时，分析能够自动回退并完成。
- 三个业务层 Yahoo 直连入口全部迁移到 provider-neutral 服务。
- TradingView OHLCV 无任何路径使用隐式 candle type。
- 现有外部工具契约和报告结构兼容。
- 新增契约、symbol、路由和回归测试通过；现有相关测试套件通过。
- 仓库和日志中不出现 RapidAPI key。

## 13. 后续阶段

完成第一阶段后，可以分别设计 TradingView 实时 quote、经济日历、世界经济指标、选股器、社区观点和聚合 TA 评级。这些属于新增产品能力，不与本次兼容性改造绑定。
