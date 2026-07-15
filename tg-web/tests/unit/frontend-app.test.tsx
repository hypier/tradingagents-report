// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';

import { App } from '../../src/frontend/app/app';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
});

it('renders the research command dashboard', () => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  );

  expect(screen.getByRole('main')).toHaveTextContent('Research command');
  expect(screen.getByRole('heading', { name: 'Sequential agent activity' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Recent research reports' })).toBeInTheDocument();
});

it('renders the standard dashboard navigation shell', () => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  );

  expect(screen.getAllByRole('button', { name: 'Toggle Sidebar' })).not.toHaveLength(0);
});

it('renders a 404 page for an unknown route', () => {
  render(
    <MemoryRouter initialEntries={['/missing']}>
      <App />
    </MemoryRouter>,
  );

  expect(
    screen.getByRole('heading', { name: 'Page not found' }),
  ).toBeInTheDocument();
});
