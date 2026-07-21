import { describe, expect, it } from 'vitest';

import {
  decisionBadgeVariant,
  extractDecisionAction,
  formatDecisionLabel,
  normalizeDecisionId,
} from '../../src/frontend/lib/format-decision';

const zhLabels: Record<string, string> = {
  'decisions.Buy': '买入',
  'decisions.Overweight': '增持',
  'decisions.Hold': '持有',
  'decisions.Underweight': '减持',
  'decisions.Sell': '卖出',
};

const t = (key: string, options?: { defaultValue?: string }) =>
  zhLabels[key] ?? options?.defaultValue ?? key;

describe('formatDecisionLabel', () => {
  it('normalizes known ratings case-insensitively', () => {
    expect(normalizeDecisionId('buy')).toBe('Buy');
    expect(normalizeDecisionId('OVERWEIGHT')).toBe('Overweight');
    expect(normalizeDecisionId('Hold')).toBe('Hold');
  });

  it('extracts action from object decisions', () => {
    expect(extractDecisionAction({ action: 'Sell' })).toBe('Sell');
    expect(extractDecisionAction('Hold')).toBe('Hold');
  });

  it('localizes the five-tier portfolio ratings', () => {
    expect(formatDecisionLabel('Buy', t)).toBe('买入');
    expect(formatDecisionLabel({ action: 'Overweight' }, t)).toBe('增持');
    expect(formatDecisionLabel('Hold', t)).toBe('持有');
    expect(formatDecisionLabel('Underweight', t)).toBe('减持');
    expect(formatDecisionLabel('Sell', t)).toBe('卖出');
  });

  it('passes through unknown ratings', () => {
    expect(formatDecisionLabel('Accumulate', t)).toBe('Accumulate');
  });

  it('maps ratings to rise / fall / outline badge tones', () => {
    expect(decisionBadgeVariant('Buy')).toBe('up');
    expect(decisionBadgeVariant('Overweight')).toBe('up');
    expect(decisionBadgeVariant('Hold')).toBe('outline');
    expect(decisionBadgeVariant('Underweight')).toBe('down');
    expect(decisionBadgeVariant('Sell')).toBe('down');
    expect(decisionBadgeVariant('Unknown')).toBe('outline');
  });
});
