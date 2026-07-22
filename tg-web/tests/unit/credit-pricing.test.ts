import { describe, expect, it } from 'vitest';

import { calculateActualPoints } from '../../src/backend/billing/credit-pricing';

const settings = {
  pointsPerUsd: '100',
  markupBasisPoints: 1_000,
};

describe('credit pricing', () => {
  it('charges actual cost with markup and rounds points upward', () => {
    expect(calculateActualPoints('0.12300000', settings)).toBe(14);
  });

  it('does not charge a zero-cost successful analysis', () => {
    expect(calculateActualPoints('0', settings)).toBe(0);
  });

  it('charges at least one point for any positive cost', () => {
    expect(calculateActualPoints('0.00000001', settings)).toBe(1);
  });
});
