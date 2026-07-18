// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

import { App } from '../../src/frontend/app/app';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
});

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

it('renders the research command dashboard', () => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  );

  expect(screen.getByRole('main')).toHaveTextContent('Research command');
  expect(
    screen.getByRole('heading', { name: 'Sequential agent activity' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Recent research reports' }),
  ).toBeInTheDocument();
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
    screen.queryByRole('button', { name: 'Reports' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Settings' }),
  ).not.toBeInTheDocument();
  const researchLinks = screen.getAllByRole('link', { name: 'Research' });
  expect(researchLinks).not.toHaveLength(0);
  expect(researchLinks.every((link) => link.getAttribute('href') === '/')).toBe(
    true,
  );
  const submitButtons = screen.getAllByRole('button', { name: 'Run analysis' });
  expect(
    submitButtons.every((button) => button.getAttribute('type') === 'submit'),
  ).toBe(true);
});

it('renders an injected account menu in the dashboard header', () => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <App accountMenu={<button type="button">Account</button>} />
    </MemoryRouter>,
  );

  expect(screen.getByRole('button', { name: 'Account' })).toBeInTheDocument();
});

it('does not expose unsupported research configuration controls', () => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  );

  expect(screen.queryByText('Market', { exact: true })).not.toBeInTheDocument();
  expect(
    screen.queryByText('Research depth', { exact: true }),
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
    within(container).getByRole('heading', { name: 'Research report' }),
  ).toBeInTheDocument();
  expect(container.querySelector('.max-w-5xl')).toBeNull();
});
