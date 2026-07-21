// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import {
  groupJobsByTicker,
  ReportsByTicker,
} from '../../src/frontend/components/dashboard/reports-by-ticker';
import { TooltipProvider } from '../../src/frontend/components/ui/tooltip';

it('groups jobs by ticker and sorts dates newest first', () => {
  const groups = groupJobsByTicker([
    {
      id: 'a1',
      ticker: 'AAPL',
      status: 'succeeded',
      trade_date: '2026-07-01',
    },
    {
      id: 't1',
      ticker: '700',
      status: 'succeeded',
      trade_date: '2026-07-20',
    },
    {
      id: 'a2',
      ticker: 'AAPL',
      status: 'succeeded',
      trade_date: '2026-07-15',
    },
  ]);

  expect(groups.map((group) => group.ticker)).toEqual(['700', 'AAPL']);
  expect(groups[1]?.jobs.map((job) => job.id)).toEqual(['a2', 'a1']);
});

it('renders ticker headers with dated report rows', () => {
  const onOpenReport = vi.fn();

  render(
    <TooltipProvider>
      <ReportsByTicker
        jobs={[
          {
            id: 'job-1',
            ticker: 'AAPL',
            status: 'succeeded',
            trade_date: '2026-07-21',
            decision: 'Buy',
            output_language: 'Chinese',
            analysts: ['market', 'fundamentals'],
            updated_at: '2026-07-21T10:00:00Z',
            display: { display_name: 'Apple Inc.' },
          },
          {
            id: 'job-2',
            ticker: 'AAPL',
            status: 'succeeded',
            trade_date: '2026-07-10',
            decision: 'Hold',
          },
        ]}
        loading={false}
        error={false}
        onOpenReport={onOpenReport}
      />
    </TooltipProvider>,
  );

  expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
  expect(screen.getByText('2 reports')).toBeInTheDocument();
  expect(screen.getByText('Buy')).toHaveAttribute('data-variant', 'up');
  expect(screen.getByText('Chinese · 中文')).toBeInTheDocument();
  expect(screen.getByText('Market, Fundamentals')).toBeInTheDocument();

  const rows = screen.getAllByRole('button');
  const dateRow = rows.find((row) => within(row).queryByText('Buy'));
  expect(dateRow).toBeTruthy();
  fireEvent.click(dateRow!);
  expect(onOpenReport).toHaveBeenCalledWith('job-1');
});
