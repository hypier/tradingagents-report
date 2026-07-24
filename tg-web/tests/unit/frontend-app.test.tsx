// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

import { App } from '../../src/frontend/app/app';

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

it('renders the signed-in research overview at the root route', () => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  );

  expect(screen.getByRole('main')).toHaveTextContent('Research overview');
  expect(
    screen.getByRole('heading', { name: 'Recent reports' }),
  ).toBeInTheDocument();
  expect(
    screen.getAllByRole('link', { name: 'Start analysis' }).length,
  ).toBeGreaterThan(0);
  expect(
    screen.getByRole('link', { name: /Report library/ }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('heading', { name: 'Research desk' }),
  ).not.toBeInTheDocument();
});

it('renders the standard dashboard navigation shell', () => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  );

  expect(
    screen.getAllByRole('button', { name: 'Toggle Sidebar' }),
  ).not.toHaveLength(0);
  expect(
    screen.queryByRole('button', { name: 'Settings' }),
  ).not.toBeInTheDocument();
  const deskLinks = screen.getAllByRole('link', { name: 'Desk' });
  expect(deskLinks).not.toHaveLength(0);
  expect(deskLinks.every((link) => link.getAttribute('href') === '/desk')).toBe(
    true,
  );
});

it('renders Quotes above Watchlist in the market nav group', () => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  );

  const quotesLinks = screen.getAllByRole('link', { name: 'Market Quotes' });
  const watchlistLinks = screen.getAllByRole('link', { name: 'Watchlist' });
  expect(quotesLinks.length).toBeGreaterThan(0);
  expect(watchlistLinks.length).toBeGreaterThan(0);
  expect(quotesLinks[0]!.getAttribute('href')).toBe('/quotes');
  expect(watchlistLinks[0]!.getAttribute('href')).toBe('/watchlist');
  expect(
    quotesLinks[0]!.compareDocumentPosition(watchlistLinks[0]!) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

it('renders an injected account menu in the dashboard header', () => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <App accountMenu={<button type="button">Account menu</button>} />
    </MemoryRouter>,
  );

  expect(
    screen.getByRole('button', { name: 'Account menu' }),
  ).toBeInTheDocument();
});

it('does not expose unsupported research configuration controls', () => {
  render(
    <MemoryRouter initialEntries={['/desk']}>
      <App />
    </MemoryRouter>,
  );

  expect(
    screen.queryByText('Research depth', { exact: true }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText('Market', { exact: true }),
  ).not.toBeInTheDocument();
});

it('renders a 404 page for an unknown route', () => {
  render(
    <MemoryRouter initialEntries={['/missing']}>
      <App />
    </MemoryRouter>,
  );

  const heading = screen.getByRole('heading', { name: 'Page not found' });
  expect(heading).toBeInTheDocument();
  expect(heading).toHaveClass('text-foreground');
});

it('renders a report detail page inside the dashboard shell', () => {
  const { container } = render(
    <MemoryRouter initialEntries={['/reports/job-1']}>
      <App />
    </MemoryRouter>,
  );

  expect(
    within(container).getAllByRole('button', { name: 'Toggle Sidebar' }),
  ).not.toHaveLength(0);
  expect(
    within(container).getAllByRole('heading', { name: 'Report' }).length,
  ).toBeGreaterThan(0);
  expect(
    within(container).getByRole('button', { name: /back/i }),
  ).toBeInTheDocument();
  expect(container.querySelector('.max-w-5xl')).toBeNull();
});

it('renders the complete report library inside the dashboard shell', () => {
  const { container } = render(
    <MemoryRouter initialEntries={['/reports']}>
      <App />
    </MemoryRouter>,
  );

  expect(
    within(container).getAllByRole('button', { name: 'Toggle Sidebar' }),
  ).not.toHaveLength(0);
  expect(
    within(container).getByRole('heading', { name: 'Reports' }),
  ).toBeInTheDocument();
  expect(
    within(container).queryByRole('heading', { name: 'Research archive' }),
  ).not.toBeInTheDocument();
  expect(
    within(container).queryByRole('combobox', { name: 'Status' }),
  ).not.toBeInTheDocument();
  fireEvent.click(within(container).getByRole('button', { name: /Filters/i }));
  expect(
    within(container).getByRole('combobox', { name: 'Status' }),
  ).toHaveTextContent('Succeeded');
  const reportLinks = within(container).getAllByRole('link', {
    name: 'Reports',
  });
  expect(
    reportLinks.every((link) => link.getAttribute('href') === '/reports'),
  ).toBe(true);
});
