import { describe, expect, it } from 'vitest';

import { resolveCreditUnits } from '../../src/shared/analysis-credits';

describe('resolveCreditUnits', () => {
  const rules = [
    {
      market: null,
      minAnalysts: 1,
      maxAnalysts: 99,
      units: 1,
      enabled: 1,
      priority: 0,
    },
    {
      market: 'US',
      minAnalysts: 1,
      maxAnalysts: 2,
      units: 2,
      enabled: 1,
      priority: 10,
    },
    {
      market: 'US',
      minAnalysts: 3,
      maxAnalysts: 4,
      units: 3,
      enabled: 1,
      priority: 20,
    },
    {
      market: 'HK',
      minAnalysts: 1,
      maxAnalysts: 99,
      units: 5,
      enabled: 0,
      priority: 50,
    },
  ];

  it('falls back to 1 when no rules match', () => {
    expect(resolveCreditUnits({ market: 'CN', analystCount: 1 }, [])).toBe(1);
  });

  it('prefers higher priority matching market rules', () => {
    expect(
      resolveCreditUnits({ market: 'US', analystCount: 4 }, rules),
    ).toBe(3);
    expect(
      resolveCreditUnits({ market: 'US', analystCount: 2 }, rules),
    ).toBe(2);
  });

  it('uses wildcard rules when market-specific ones do not match', () => {
    expect(
      resolveCreditUnits({ market: 'CN', analystCount: 3 }, rules),
    ).toBe(1);
  });

  it('ignores disabled rules', () => {
    expect(
      resolveCreditUnits({ market: 'HK', analystCount: 2 }, rules),
    ).toBe(1);
  });
});
