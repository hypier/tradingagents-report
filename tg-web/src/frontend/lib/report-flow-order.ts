/**
 * Canonical reading / derivation order for finished analysis reports.
 *
 * Core `build_reports()` insertion order puts debate & risk chapters after the
 * final decision. The UI reorders to the path readers should follow.
 */

export type ReportFlowStageId =
  | 'evidence'
  | 'debate'
  | 'research'
  | 'trade'
  | 'risk'
  | 'risk_judge'
  | 'final'
  | 'other';

export type ReportFlowStage = {
  id: ReportFlowStageId;
  /** Report keys that belong to this stage, in reading order. */
  keys: readonly string[];
  /** When true, keys are parallel inputs that feed the next stage. */
  parallel?: boolean;
};

/** Stages that form the decision derivation path. */
export const REPORT_FLOW_STAGES: readonly ReportFlowStage[] = [
  {
    id: 'evidence',
    parallel: true,
    keys: [
      'market_report',
      'sentiment_report',
      'news_report',
      'fundamentals_report',
    ],
  },
  {
    id: 'debate',
    parallel: true,
    keys: ['bull_researcher', 'bear_researcher'],
  },
  {
    id: 'research',
    keys: ['research_team_decision'],
  },
  {
    id: 'trade',
    keys: ['trader_investment_plan'],
  },
  {
    id: 'risk',
    parallel: true,
    keys: ['risky_analyst', 'safe_analyst', 'neutral_analyst'],
  },
  {
    id: 'risk_judge',
    keys: ['risk_management_decision'],
  },
  {
    id: 'final',
    keys: ['final_trade_decision'],
  },
] as const;

const READING_ORDER: readonly string[] = REPORT_FLOW_STAGES.flatMap(
  (stage) => stage.keys,
);

const ORDER_INDEX = new Map(
  READING_ORDER.map((key, index) => [key, index] as const),
);

/** Sort available report keys into the guided reading sequence. */
export function orderReportKeys(keys: readonly string[]): string[] {
  const known: string[] = [];
  const unknown: string[] = [];
  for (const key of keys) {
    if (ORDER_INDEX.has(key)) known.push(key);
    else unknown.push(key);
  }
  known.sort(
    (a, b) => (ORDER_INDEX.get(a) ?? 0) - (ORDER_INDEX.get(b) ?? 0),
  );
  return [...known, ...unknown];
}

/** Build flow stages that only include keys present in this report. */
export function buildReportFlowStages(
  availableKeys: readonly string[],
): ReportFlowStage[] {
  const available = new Set(availableKeys);
  const stages: ReportFlowStage[] = [];

  for (const stage of REPORT_FLOW_STAGES) {
    const keys = stage.keys.filter((key) => available.has(key));
    if (!keys.length) continue;
    stages.push({
      id: stage.id,
      parallel: stage.parallel,
      keys,
    });
  }

  const known = new Set(READING_ORDER);
  const extras = availableKeys.filter((key) => !known.has(key));
  if (extras.length) {
    stages.push({ id: 'other', keys: extras, parallel: true });
  }

  return stages;
}

export function stageForReportKey(
  key: string,
): ReportFlowStageId | undefined {
  for (const stage of REPORT_FLOW_STAGES) {
    if (stage.keys.includes(key)) return stage.id;
  }
  return undefined;
}
