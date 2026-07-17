// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';

import { App } from '../../src/frontend/app/app';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
});

it('renders the research command dashboard', () => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  );

  expect(screen.getByRole('main')).toHaveTextContent('Research desk');
  expect(
    screen.getByRole('heading', { name: 'Agent activity' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Recent reports' }),
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
    screen.queryByRole('button', { name: 'Settings' }),
  ).not.toBeInTheDocument();
  const deskLinks = screen.getAllByRole('link', { name: 'Desk' });
  expect(deskLinks).not.toHaveLength(0);
  expect(deskLinks.every((link) => link.getAttribute('href') === '/')).toBe(
    true,
  );
  const submitButtons = screen.getAllByRole('button', { name: 'Run analysis' });
  expect(
    submitButtons.every((button) => button.getAttribute('type') === 'submit'),
  ).toBe(true);
});

it('does not expose unsupported research configuration controls', () => {
  render(
    <MemoryRouter initialEntries={['/']}>
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
    within(container).getByRole('heading', { name: 'Research report' }),
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
    within(container).getByRole('heading', { name: 'All reports' }),
  ).toBeInTheDocument();
  expect(
    within(container).getByRole('heading', { name: 'Report library' }),
  ).toBeInTheDocument();
  expect(
    within(container).getByRole('combobox', { name: 'Status' }),
  ).toHaveTextContent('All statuses');
  const reportLinks = within(container).getAllByRole('link', {
    name: 'Reports',
  });
  expect(
    reportLinks.every((link) => link.getAttribute('href') === '/reports'),
  ).toBe(true);
});
