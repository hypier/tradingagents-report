import { describe, expect, it } from 'vitest';

import { normalizeMarketSession } from '../../src/shared/market-session';

describe('normalizeMarketSession', () => {
  it('maps TradingView session strings to product phases', () => {
    expect(normalizeMarketSession('pre_market')).toBe('pre_market');
    expect(normalizeMarketSession('regular')).toBe('regular');
    expect(normalizeMarketSession('post_market')).toBe('post_market');
    expect(normalizeMarketSession('out_of_session')).toBe('closed');
  });

  it('treats non-tradable without session as closed', () => {
    expect(normalizeMarketSession(undefined, false)).toBe('closed');
  });

  it('returns unknown for empty or unrecognized values', () => {
    expect(normalizeMarketSession(undefined)).toBe('unknown');
    expect(normalizeMarketSession('odd_session')).toBe('unknown');
  });
});
