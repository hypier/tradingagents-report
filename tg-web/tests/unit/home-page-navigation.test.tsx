// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { fireEvent, render, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

import { App } from '../../src/frontend/app/app';

vi.mock('../../src/frontend/lib/research', () => ({
  createResearch: vi.fn(),
  getMarketIdentities: vi.fn().mockResolvedValue({
    data: [],
    requestId: 'request-1',
  }),
  getMarketSnapshot: vi.fn(),
  getResearch: vi.fn().mockResolvedValue({
    data: { ticker: 'AAPL', status: 'succeeded', reports: {} },
    requestId: 'request-1',
  }),
  getResearchEvents: vi.fn(),
  listResearch: vi.fn().mockResolvedValue({
    data: [
      {
        id: 'job-1',
        ticker: 'AAPL',
        status: 'succeeded',
        analysts: ['market'],
      },
    ],
    requestId: 'request-1',
  }),
}));

vi.mock('../../src/frontend/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue({
    data: {
      authenticated: true,
      session: { id: 'session-1' },
      user: {
        id: 'user-1',
        displayName: 'Test User',
        email: 'test@example.test',
        imageUrl: '',
        role: 'user',
      },
    },
    requestId: 'request-1',
  }),
}));

it('opens a report action on the report detail page', async () => {
  const { container } = render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  );

  fireEvent.click(
    await within(container).findByRole('button', {
      name: 'View report for AAPL',
    }),
  );

  expect(
    await within(container).findByRole('heading', { name: 'AAPL' }),
  ).toBeInTheDocument();
  expect(within(container).getByText('Research report')).toBeInTheDocument();
});
