import { isKnownTvMarketCode } from '@/shared/market-codes';

const STORAGE_KEY = 'tg-web.recent-tv-markets';
const MAX_RECENT = 6;

function readCodes(): string[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const seen = new Set<string>();
    const codes: string[] = [];
    for (const item of parsed) {
      if (typeof item !== 'string') continue;
      const code = item.trim().toLowerCase();
      if (!code || seen.has(code) || !isKnownTvMarketCode(code)) continue;
      seen.add(code);
      codes.push(code);
      if (codes.length >= MAX_RECENT) break;
    }
    return codes;
  } catch {
    return [];
  }
}

function writeCodes(codes: string[]) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(codes));
  } catch {
    // Ignore quota / privacy mode failures.
  }
}

/** Most-recently-used TradingView market codes (local cache). */
export function loadRecentTvMarkets(): string[] {
  return readCodes();
}

/** Push a selected market to the front of the recent list. */
export function rememberTvMarket(code: string): string[] {
  const normalized = code.trim().toLowerCase();
  if (!normalized || !isKnownTvMarketCode(normalized)) {
    return readCodes();
  }

  const next = [
    normalized,
    ...readCodes().filter((item) => item !== normalized),
  ].slice(0, MAX_RECENT);
  writeCodes(next);
  return next;
}
