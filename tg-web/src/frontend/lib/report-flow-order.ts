/**
 * Canonical reading / derivation order for finished analysis reports.
 *
 * Core `build_reports()` insertion order puts debate & risk chapters after the
 * final decision. The UI reorders to the path readers should follow.
 *
 * Portfolio Manager writes one decision into both
 * `risk_management_decision` (legacy alias of risk judge) and
 * `final_trade_decision`. The UI keeps a single "Final decision" chapter.
 */

export type ReportFlowStageId =
  | 'evidence'
  | 'debate'
  | 'research'
  | 'trade'
  | 'risk'
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
    id: 'final',
    // Prefer final_trade_decision; risk_management_decision is a legacy alias
    // kept only when the canonical final chapter is absent.
    keys: ['final_trade_decision', 'risk_management_decision'],
  },
] as const;

const READING_ORDER: readonly string[] = REPORT_FLOW_STAGES.flatMap(
  (stage) => stage.keys,
);

const ORDER_INDEX = new Map(
  READING_ORDER.map((key, index) => [key, index] as const),
);

/** Drop the legacy risk-judge key when the final decision chapter is present. */
function collapseDuplicateFinalKeys(keys: readonly string[]): string[] {
  const hasFinal = keys.includes('final_trade_decision');
  if (!hasFinal) return [...keys];
  return keys.filter((key) => key !== 'risk_management_decision');
}

/** Sort available report keys into the guided reading sequence. */
export function orderReportKeys(keys: readonly string[]): string[] {
  const collapsed = collapseDuplicateFinalKeys(keys);
  const known: string[] = [];
  const unknown: string[] = [];
  for (const key of collapsed) {
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
  const available = new Set(collapseDuplicateFinalKeys(availableKeys));
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
  const extras = [...available].filter((key) => !known.has(key));
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
