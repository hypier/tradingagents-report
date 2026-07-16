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

  expect(within(container).getAllByText('Complete')).toHaveLength(3);
  expect(within(container).getByText('In progress')).toHaveAttribute(
    'data-variant',
    'default',
  );
});

it('shows the most recent Core evidence event', () => {
  const { container } = render(
    <PipelinePanel
      events={[
        {
          kind: 'tool_call',
          message: 'Market Analyst: calling get_stock_data',
        },
        {
          kind: 'tool_call',
          message: 'Market Analyst: calling get_indicators',
        },
        { kind: 'stage', message: 'Running Fundamentals Analyst' },
        { kind: 'stage', message: 'Running News Analyst' },
        { kind: 'stage', message: 'Running Sentiment Analyst' },
        { kind: 'stage', message: 'Running research debate (0/2)' },
        { kind: 'stage', message: 'Running Trader' },
      ]}
    />,
  );

  expect(within(container).getByText('Running Trader')).toBeInTheDocument();
  expect(
    within(container).queryByText('Market Analyst: calling get_stock_data'),
  ).not.toBeInTheDocument();
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

  const completeStages = within(container).getAllByText('Complete');
  expect(completeStages).toHaveLength(8);
  completeStages.forEach((stage) =>
    expect(stage).toHaveAttribute('data-variant', 'default'),
  );
});
