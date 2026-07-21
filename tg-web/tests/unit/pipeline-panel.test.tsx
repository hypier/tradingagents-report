// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, within } from '@testing-library/react';
import { expect, it } from 'vitest';

import { PipelinePanel } from '../../src/frontend/components/dashboard/pipeline-panel';

const analysts = ['market', 'fundamentals', 'news', 'social'];

it('marks the Core sentiment step as in progress', () => {
  const { container } = render(
    <PipelinePanel
      job={{
        id: 'job-1',
        ticker: 'AAPL',
        status: 'running',
        analysts,
        progress_percent: 40,
        current_step: 'Running Sentiment Analyst',
      }}
    />,
  );

  expect(
    within(container).getAllByLabelText(/: Complete$/),
  ).toHaveLength(3);
  expect(
    within(container).getByLabelText('Sentiment: In progress'),
  ).toHaveAttribute('data-stage-status', 'In progress');
  expect(
    within(container).getByText(
      'Social buzz, crowd positioning, and narrative shift.',
    ),
  ).toBeInTheDocument();
  expect(
    within(container).getByText('Bull vs bear research debate.'),
  ).toBeInTheDocument();
});

it('shows the full event history with timestamps in a scrollable log', () => {
  const { container } = render(
    <PipelinePanel
      events={[
        {
          kind: 'tool_call',
          message: 'Market Analyst: calling get_stock_data',
          time: '2026-01-15T10:00:01+00:00',
        },
        {
          kind: 'tool_call',
          message: 'Market Analyst: calling get_indicators',
          time: '2026-01-15T10:00:02+00:00',
        },
        { kind: 'stage', message: 'Running Fundamentals Analyst' },
        { kind: 'stage', message: 'Running News Analyst' },
        { kind: 'stage', message: 'Running Sentiment Analyst' },
        { kind: 'stage', message: 'Running research debate (0/2)' },
        {
          kind: 'stage',
          message: 'Running Trader',
          time: '2026-01-15T10:05:00+00:00',
        },
      ]}
    />,
  );

  expect(within(container).getByText('Running Trader')).toBeInTheDocument();
  expect(
    within(container).getByText('Market Analyst: calling get_stock_data'),
  ).toBeInTheDocument();
  expect(
    container.querySelector('time[datetime="2026-01-15T10:05:00+00:00"]'),
  ).toBeInTheDocument();
});

it('marks every stage complete when Core reports success', () => {
  const { container } = render(
    <PipelinePanel
      job={{
        id: 'job-1',
        ticker: 'AAPL',
        status: 'succeeded',
        analysts,
        progress_percent: 100,
        current_step: 'Completed',
      }}
    />,
  );

  const completeStages = within(container).getAllByLabelText(/: Complete$/);
  expect(completeStages).toHaveLength(8);
  completeStages.forEach((stage) =>
    expect(stage).toHaveAttribute('data-stage-status', 'Complete'),
  );
});
