// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { DecisionBriefCard } from '@/frontend/components/report/decision-brief-card';
import type { AnalysisDecision } from '@/frontend/lib/research';

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
  add_levels: [{ low: 351, high: 353 }],
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

beforeAll(async () => {
  const { default: i18n } = await import('../../src/frontend/i18n');
  await i18n.changeLanguage('en');
});

describe('DecisionBriefCard', () => {
  it('renders the final rating, mixed price plan, cases, and four signal lanes', () => {
    render(<DecisionBriefCard decision={decision} />);

    expect(screen.getByText('Underweight')).toHaveAttribute(
      'data-variant',
      'down',
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Reduce exposure while cash returns remain unproven.',
    );
    expect(screen.getByText('341.91 USD')).toBeInTheDocument();
    expect(screen.getByText('335.00–342.00 USD')).toBeInTheDocument();
    expect(screen.getByText('351.00–353.00 USD')).toBeInTheDocument();
    expect(screen.getByText('322.00 USD')).toBeInTheDocument();
    expect(screen.getByText('430.00 USD')).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Price plan' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(5);
    expect(
      screen.getByText('Operating growth remains resilient.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Daily trend is weak.')).toBeInTheDocument();
    expect(screen.getByText('Growth remains strong.')).toBeInTheDocument();
  });

  it('does not render a card for legacy decisions without a headline', () => {
    const { container } = render(
      <DecisionBriefCard decision={{ action: 'Hold', rating: 'Hold' }} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('calls onViewDetail from the bottom CTA', () => {
    const onViewDetail = vi.fn();
    render(
      <DecisionBriefCard decision={decision} onViewDetail={onViewDetail} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /full report/i }));
    expect(onViewDetail).toHaveBeenCalledTimes(1);
  });

  it('shows unavailable analyst lanes without inventing a direction', () => {
    render(
      <DecisionBriefCard
        decision={{
          ...decision,
          section_stances: {
            ...decision.section_stances!,
            fundamentals: {
              stance: 'unavailable',
              note: 'Fundamentals were not selected for this run.',
            },
          },
        }}
      />,
    );

    expect(screen.getByText('Unavailable')).toHaveAttribute(
      'data-variant',
      'outline',
    );
    expect(
      screen.getByText('Fundamentals were not selected for this run.'),
    ).toBeInTheDocument();
  });
});
