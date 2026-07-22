/**
 * Normalize TradingView `current_session` into product-facing session phases.
 * Do not invent open/closed from free-text market notes — prefer the vendor field.
 */
export type MarketSessionPhase =
  | 'pre_market'
  | 'regular'
  | 'post_market'
  | 'closed'
  | 'unknown';

const PRE_MARKET = new Set([
  'pre_market',
  'premarket',
  'pre-market',
  'pre',
]);
const REGULAR = new Set(['regular', 'market', 'rth', 'open']);
const POST_MARKET = new Set([
  'post_market',
  'postmarket',
  'post-market',
  'after_hours',
  'after-hours',
  'afterhours',
  'post',
]);
const CLOSED = new Set([
  'out_of_session',
  'closed',
  'off',
  'holiday',
  'expired',
]);

export function normalizeMarketSession(
  currentSession: string | null | undefined,
  isTradable?: boolean | null,
): MarketSessionPhase {
  const raw = (currentSession ?? '').trim().toLowerCase();
  if (PRE_MARKET.has(raw)) return 'pre_market';
  if (REGULAR.has(raw)) return 'regular';
  if (POST_MARKET.has(raw)) return 'post_market';
  if (CLOSED.has(raw)) return 'closed';
  if (!raw && isTradable === false) return 'closed';
  if (!raw) return 'unknown';
  return 'unknown';
}
