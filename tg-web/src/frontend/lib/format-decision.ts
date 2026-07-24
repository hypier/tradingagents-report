/** Canonical 5-tier portfolio ratings from Core Portfolio Manager. */
export const DECISION_IDS = [
  'Buy',
  'Overweight',
  'Hold',
  'Underweight',
  'Sell',
] as const;

export type DecisionId = (typeof DECISION_IDS)[number];

const DECISION_ALIASES: Record<string, DecisionId> = {
  buy: 'Buy',
  overweight: 'Overweight',
  hold: 'Hold',
  underweight: 'Underweight',
  sell: 'Sell',
};

export function normalizeDecisionId(
  value?: string | null,
): DecisionId | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if ((DECISION_IDS as readonly string[]).includes(trimmed)) {
    return trimmed as DecisionId;
  }
  return DECISION_ALIASES[trimmed.toLowerCase()] ?? null;
}

/** Extract raw rating text from job.decision, preferring the canonical rating field. */
export function extractDecisionAction(decision: unknown): string | null {
  if (decision == null) return null;
  if (typeof decision === 'string') {
    const trimmed = decision.trim();
    return trimmed || null;
  }
  if (typeof decision === 'object') {
    const rating = (decision as { rating?: unknown }).rating;
    if (typeof rating === 'string' && rating.trim()) return rating.trim();
    const action = (decision as { action?: unknown }).action;
    if (typeof action === 'string' && action.trim()) return action.trim();
  }
  return null;
}

type Translate = (
  key: string,
  options?: { defaultValue?: string },
) => string;

/** Localize a portfolio decision for UI display. Unknown values pass through. */
export function formatDecisionLabel(
  decision: unknown,
  t: Translate,
): string | null {
  const raw = extractDecisionAction(decision);
  if (!raw) return null;
  const id = normalizeDecisionId(raw);
  if (!id) return raw;
  return t(`decisions.${id}`, { defaultValue: id });
}

/** Badge tone for 5-tier ratings — Rise / Fall / neutral outline. */
export function decisionBadgeVariant(
  decision: unknown,
): 'up' | 'down' | 'outline' {
  const id = normalizeDecisionId(extractDecisionAction(decision));
  if (id === 'Buy' || id === 'Overweight') return 'up';
  if (id === 'Sell' || id === 'Underweight') return 'down';
  return 'outline';
}
