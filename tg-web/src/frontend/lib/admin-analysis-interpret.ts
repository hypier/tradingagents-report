/** Extract human-readable rows from admin analysis job JSON payloads. */

export type InterpretRow = {
  /** i18n key under admin:analyses.interpret.fields.* */
  fieldKey: string;
  value: string;
  /** Optional secondary mono note (e.g. raw model id). */
  note?: string;
};

export type InterpretSection = {
  /** i18n key under admin:analyses.sections.* or interpret.sections.* */
  sectionKey: string;
  rows: InterpretRow[];
};

type JobLike = {
  token_usage?: Record<string, unknown> | null;
  cost_breakdown?: Record<string, unknown> | null;
  credit_pricing?: Record<string, unknown> | null;
  request?: Record<string, unknown> | null;
  config?: Record<string, unknown> | null;
  events?: unknown[] | null;
  tokens_used?: number | null;
  cost_usd?: string | number | null;
  output_language?: string | null;
  analysts?: string[] | null;
  ticker?: string | null;
  exchange?: string | null;
  trade_date?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return null;
}

function formatUsd(value: unknown): string | null {
  const n = asNumber(value);
  if (n == null) return asString(value);
  return `$${n.toFixed(6)}`;
}

function formatTokens(value: unknown): string | null {
  const n = asNumber(value);
  if (n == null) return asString(value);
  return n.toLocaleString();
}

function formatPercentFromBps(bps: unknown): string | null {
  const n = asNumber(bps);
  if (n == null) return null;
  return `${(n / 100).toFixed(n % 100 === 0 ? 0 : 2)}%`;
}

function push(
  rows: InterpretRow[],
  fieldKey: string,
  value: unknown,
  format: (v: unknown) => string | null = asString,
  note?: string,
) {
  const formatted = format(value);
  if (formatted == null || formatted === '') return;
  rows.push({ fieldKey, value: formatted, ...(note ? { note } : {}) });
}

function interpretTokenUsage(job: JobLike): InterpretSection {
  const usage = isRecord(job.token_usage) ? job.token_usage : {};
  const rows: InterpretRow[] = [];
  push(rows, 'totalTokens', usage.total_tokens ?? job.tokens_used, formatTokens);
  push(rows, 'promptTokens', usage.prompt_tokens, formatTokens);
  push(rows, 'completionTokens', usage.completion_tokens, formatTokens);
  push(rows, 'cacheReadTokens', usage.cache_read_input_tokens, formatTokens);
  push(rows, 'cacheWriteTokens', usage.cache_creation_input_tokens, formatTokens);
  push(rows, 'fallbackModel', usage.model);

  const byModel = isRecord(usage.by_model) ? usage.by_model : null;
  if (byModel) {
    for (const [model, raw] of Object.entries(byModel)) {
      const bucket = isRecord(raw) ? raw : {};
      const total =
        formatTokens(bucket.total_tokens) ??
        formatTokens(
          (asNumber(bucket.prompt_tokens) ?? 0) +
            (asNumber(bucket.completion_tokens) ?? 0),
        ) ??
        '—';
      const prompt = formatTokens(bucket.prompt_tokens) ?? '—';
      const completion = formatTokens(bucket.completion_tokens) ?? '—';
      rows.push({
        fieldKey: 'modelTokens',
        value: `${total} (in ${prompt} / out ${completion})`,
        note: model,
      });
    }
  }

  return { sectionKey: 'tokenUsage', rows };
}

function interpretCostBreakdown(job: JobLike): InterpretSection {
  const cost = isRecord(job.cost_breakdown) ? job.cost_breakdown : {};
  const rows: InterpretRow[] = [];
  push(
    rows,
    'totalCost',
    cost.total_cost_usd ?? cost.total_cost ?? job.cost_usd,
    formatUsd,
  );
  push(rows, 'currency', cost.currency);
  push(rows, 'pricingSource', cost.pricing_source);

  const items = Array.isArray(cost.items) ? cost.items : [];
  for (const item of items) {
    if (!isRecord(item)) continue;
    const model = asString(item.model) ?? '—';
    const priced = item.priced === true;
    const itemCost = formatUsd(item.total_cost_usd ?? item.total_cost) ?? '—';
    const tokens = formatTokens(item.total_tokens) ?? '—';
    rows.push({
      fieldKey: priced ? 'modelCostPriced' : 'modelCostUnpriced',
      value: `${itemCost} · ${tokens} tokens`,
      note: model,
    });
  }

  return { sectionKey: 'costBreakdown', rows };
}

function interpretCreditPricing(job: JobLike): InterpretSection {
  const pricing = isRecord(job.credit_pricing) ? job.credit_pricing : {};
  const rows: InterpretRow[] = [];
  push(
    rows,
    'pointsPerUsd',
    pricing.points_per_usd ?? pricing.pointsPerUsd,
  );
  const markup =
    pricing.markup_basis_points ?? pricing.markupBasisPoints;
  const markupPct = formatPercentFromBps(markup);
  if (markupPct) {
    rows.push({
      fieldKey: 'markup',
      value: markupPct,
      note:
        asNumber(markup) != null
          ? `${asNumber(markup)} bps`
          : undefined,
    });
  }
  push(
    rows,
    'balanceThreshold',
    pricing.analysis_balance_threshold ??
      pricing.analysisBalanceThreshold,
  );
  return { sectionKey: 'creditPricing', rows };
}

function interpretRequest(job: JobLike): InterpretSection {
  const request = isRecord(job.request) ? job.request : {};
  const instrument = isRecord(request.instrument) ? request.instrument : null;
  const rows: InterpretRow[] = [];
  push(rows, 'ticker', request.ticker ?? job.ticker);
  if (instrument) {
    push(
      rows,
      'instrument',
      [
        asString(instrument.exchange),
        asString(instrument.symbol),
      ]
        .filter(Boolean)
        .join(':') || null,
    );
    push(rows, 'displayTicker', instrument.display_ticker);
  }
  push(rows, 'tradeDate', request.trade_date ?? job.trade_date);
  push(rows, 'exchange', request.exchange ?? job.exchange);
  const analysts = Array.isArray(request.analysts)
    ? request.analysts.filter((v): v is string => typeof v === 'string')
    : Array.isArray(job.analysts)
      ? job.analysts
      : [];
  if (analysts.length) {
    rows.push({ fieldKey: 'analysts', value: analysts.join(', ') });
  }
  push(
    rows,
    'outputLanguage',
    request.output_language ?? job.output_language,
  );
  push(rows, 'quickModelId', request.quick_model_id ?? request.quickModelId);
  push(rows, 'deepModelId', request.deep_model_id ?? request.deepModelId);
  push(rows, 'requestId', request.request_id ?? request.requestId);
  return { sectionKey: 'request', rows };
}

function interpretConfig(job: JobLike): InterpretSection {
  const config = isRecord(job.config) ? job.config : {};
  const rows: InterpretRow[] = [];
  push(rows, 'outputLanguage', config.output_language);
  push(rows, 'quickThinkLlm', config.quick_think_llm);
  push(rows, 'deepThinkLlm', config.deep_think_llm);
  push(rows, 'backendUrl', config.backend_url);
  push(rows, 'maxDebateRounds', config.max_debate_rounds);
  push(rows, 'maxRiskDiscussRounds', config.max_risk_discuss_rounds);
  push(rows, 'onlineTools', config.online_tools);

  // Surface a few other primitive overrides without dumping the whole map.
  const known = new Set([
    'output_language',
    'quick_think_llm',
    'deep_think_llm',
    'backend_url',
    'max_debate_rounds',
    'max_risk_discuss_rounds',
    'online_tools',
  ]);
  for (const [key, value] of Object.entries(config)) {
    if (known.has(key)) continue;
    if (value == null) continue;
    if (typeof value === 'object') continue;
    rows.push({
      fieldKey: 'configOverride',
      value: String(value),
      note: key,
    });
  }

  return { sectionKey: 'config', rows };
}

function interpretEvents(job: JobLike): InterpretSection {
  const events = Array.isArray(job.events) ? job.events : [];
  const rows: InterpretRow[] = [];
  push(rows, 'eventCount', events.length, formatTokens);

  const recent = events.slice(-12);
  for (const event of recent) {
    if (!isRecord(event)) continue;
    const message =
      asString(event.message) ??
      asString(event.step) ??
      asString(event.current_step) ??
      '—';
    const progress = asNumber(event.progress_percent);
    const kind = asString(event.kind);
    const time =
      asString(event.time) ??
      asString(event.timestamp) ??
      asString(event.at);
    const parts = [
      progress != null ? `${progress}%` : null,
      kind,
      message,
    ].filter(Boolean);
    rows.push({
      fieldKey: 'event',
      value: parts.join(' · '),
      note: time ?? undefined,
    });
  }

  return { sectionKey: 'events', rows };
}

/** Build interpret sections for an admin analysis job detail payload. */
export function interpretAdminAnalysisJob(job: JobLike): InterpretSection[] {
  return [
    interpretTokenUsage(job),
    interpretCostBreakdown(job),
    interpretCreditPricing(job),
    interpretRequest(job),
    interpretConfig(job),
    interpretEvents(job),
  ];
}
