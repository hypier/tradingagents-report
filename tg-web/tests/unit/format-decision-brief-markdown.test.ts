import { describe, expect, it } from 'vitest';

import { formatDecisionBriefMarkdown } from '../../src/frontend/lib/format-decision-brief-markdown';
import type { AnalysisDecision } from '../../src/frontend/lib/research';

const labels: Record<string, string> = {
  'decisionBrief.conviction': 'Conviction',
  'decisionBrief.asOf': 'Price date',
  'decisionBrief.referencePrice': 'Reference price',
  'decisionBrief.timeHorizon': 'Time horizon',
  'decisionBrief.positionGuidance': 'Position guidance',
  'decisionBrief.entryZone': 'Entry zone',
  'decisionBrief.addLevels': 'Add on confirmation',
  'decisionBrief.stopOrReduce': 'Stop / reduce trigger',
  'decisionBrief.targetPrice': 'Target price',
  'decisionBrief.pricePlan': 'Price plan',
  'decisionBrief.bullCase': 'Bull case',
  'decisionBrief.bearCase': 'Bear case',
  'decisionBrief.keyRisk': 'Key risk',
  'decisionBrief.invalidation': 'Invalidation',
  'decisionBrief.whatToWatch': 'What to watch',
  'decisionBrief.conflict': 'Signal conflict',
  'decisionBrief.signalSummary': 'Analyst signals',
  'decisionBrief.levels.medium': 'Medium',
  'decisionBrief.stances.bullish': 'Bullish',
  'decisionBrief.stances.bearish': 'Bearish',
  'decisionBrief.stances.neutral': 'Neutral',
  'decisionBrief.sections.market': 'Market',
  'decisionBrief.sections.sentiment': 'Sentiment',
  'decisionBrief.sections.news': 'News',
  'decisionBrief.sections.fundamentals': 'Fundamentals',
  'decisions.Underweight': 'Underweight',
};

const t = (key: string, options?: { defaultValue?: string }) =>
  labels[key] ?? options?.defaultValue ?? key;

const decision: AnalysisDecision = {
  action: 'Underweight',
  rating: 'Underweight',
  headline: 'Reduce exposure while cash returns remain unproven.',
  conviction: 'medium',
  as_of_price: 341.91,
  as_of_date: '2026-07-22',
  currency: 'USD',
  time_horizon: '3-6 months',
  position_guidance: 'Reduce to 2.5%-3.5%.',
  entry_zone: { low: 335, high: 342 },
  add_levels: [
    { low: 351.15, high: 352.84 },
    { low: 365.01, high: 369.97 },
  ],
  stop_or_reduce: 322,
  target_price: 430,
  bull_case: 'Operating growth remains resilient.',
  bear_case: 'Free cash flow is sharply compressed.',
  key_risk: 'AI capital spending stays elevated.',
  what_to_watch: [
    'Free cash flow recovery',
    'A close above the 50-day average',
  ],
  invalidation: 'Reconsider after durable cash-flow recovery.',
  section_stances: {
    market: { stance: 'bearish', note: 'Daily trend is weak.' },
    sentiment: { stance: 'bearish', note: 'Positioning is cautious.' },
    news: { stance: 'neutral', note: 'Catalysts are balanced.' },
    fundamentals: { stance: 'bullish', note: 'Growth remains strong.' },
  },
  conflict_note: 'Strong operations conflict with weak cash returns.',
};

describe('formatDecisionBriefMarkdown', () => {
  it('renders the decision brief fields used by the card UI', () => {
    const markdown = formatDecisionBriefMarkdown(decision, {
      locale: 'en',
      sectionTitle: 'Decision brief',
      t,
      tCommon: t,
    });

    expect(markdown).toContain('## Decision brief');
    expect(markdown).toContain(
      'Reduce exposure while cash returns remain unproven.',
    );
    expect(markdown).toContain('- **Underweight**');
    expect(markdown).toContain('- **Conviction** · Medium');
    expect(markdown).toContain('- **Price date** · 2026-07-22');
    expect(markdown).toContain('### Price plan');
    expect(markdown).toContain('- **Reference price** · 341.91 USD');
    expect(markdown).toContain('- **Entry zone** · 335.00–342.00 USD');
    expect(markdown).toContain(
      '- **Add on confirmation** · 351.15–352.84 USD / 365.01–369.97 USD',
    );
    expect(markdown).toContain('- **Stop / reduce trigger** · 322.00 USD');
    expect(markdown).toContain('- **Target price** · 430.00 USD');
    expect(markdown).toContain('### Position guidance');
    expect(markdown).toContain('Reduce to 2.5%-3.5%.');
    expect(markdown).toContain('### Bull case');
    expect(markdown).toContain('Operating growth remains resilient.');
    expect(markdown).toContain('- Free cash flow recovery');
    expect(markdown).toContain(
      '- **Market** · Bearish — Daily trend is weak.',
    );
    expect(markdown).toContain(
      '**Signal conflict:** Strong operations conflict with weak cash returns.',
    );
  });

  it('returns an empty string when the headline is missing', () => {
    expect(
      formatDecisionBriefMarkdown(
        { rating: 'Hold' },
        {
          locale: 'en',
          sectionTitle: 'Decision brief',
          t,
          tCommon: t,
        },
      ),
    ).toBe('');
  });
});
