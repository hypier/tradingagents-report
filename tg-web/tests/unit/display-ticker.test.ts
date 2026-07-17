import { describe, expect, it } from 'vitest';

import { formatDisplayTicker } from '../../src/shared/display-ticker';

describe('formatDisplayTicker', () => {
  it('uses Yahoo-style suffixes for non-US listings', () => {
    expect(formatDisplayTicker('700', 'HKEX:700')).toBe('0700.HK');
    expect(formatDisplayTicker('5', 'HKEX:5')).toBe('0005.HK');
    expect(formatDisplayTicker('300750', 'SZSE:300750')).toBe('300750.SZ');
    expect(formatDisplayTicker('600519', 'SSE:600519')).toBe('600519.SS');
    expect(formatDisplayTicker('7203', 'TSE:7203')).toBe('7203.T');
  });

  it('keeps US tickers bare', () => {
    expect(formatDisplayTicker('AAPL', 'NASDAQ:AAPL')).toBe('AAPL');
    expect(formatDisplayTicker('BRK-B', 'NYSE:BRK-B')).toBe('BRK-B');
  });

  it('normalizes already-suffixed tickers', () => {
    expect(formatDisplayTicker('300750.SZ')).toBe('300750.SZ');
    expect(formatDisplayTicker('700.HK')).toBe('0700.HK');
    expect(formatDisplayTicker('AAPL')).toBe('AAPL');
  });
});
