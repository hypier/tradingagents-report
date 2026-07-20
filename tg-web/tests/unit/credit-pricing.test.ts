import { describe, expect, it } from 'vitest';

import {
  buildBillingSignature,
  calculateActualPoints,
  calculateReservedPoints,
  discreteP90,
} from '../../src/backend/billing/credit-pricing';

const settings = {
  pointsPerUsd: '100',
  markupBasisPoints: 1_000,
  reserveBufferBasisPoints: 2_000,
};

describe('credit pricing', () => {
  it('reserves the configured cold-start estimate with markup and buffer', () => {
    expect(calculateReservedPoints('1.00000000', settings)).toBe(132);
  });

  it('charges actual cost with markup and rounds points upward', () => {
    expect(calculateActualPoints('0.12300000', settings)).toBe(14);
  });

  it('does not charge a zero-cost successful analysis', () => {
    expect(calculateActualPoints('0', settings)).toBe(0);
  });

  it('charges at least one point for any positive cost', () => {
    expect(calculateActualPoints('0.00000001', settings)).toBe(1);
  });

  it('selects the discrete p90 from sorted decimal costs', () => {
    expect(discreteP90(['0.10', '0.40', '0.20', '0.30'])).toBe('0.40');
  });

  it('builds the same signature regardless of analyst order', () => {
    const first = buildBillingSignature({
      analysts: ['news', 'market'],
      configOverrides: {
        llm_provider: 'openai',
        deep_think_llm: 'gpt-deep',
        quick_think_llm: 'gpt-quick',
        max_debate_rounds: 2,
        max_risk_discuss_rounds: 1,
      },
    });
    const second = buildBillingSignature({
      analysts: ['market', 'news'],
      configOverrides: {
        max_risk_discuss_rounds: 1,
        max_debate_rounds: 2,
        quick_think_llm: 'gpt-quick',
        deep_think_llm: 'gpt-deep',
        llm_provider: 'openai',
      },
    });

    expect(first).toBe(second);
  });
});
