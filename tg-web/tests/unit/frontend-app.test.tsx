// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';

import { App } from '../../src/frontend/app/app';

it('renders the scaffold home page', () => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  );

  expect(screen.getByRole('main')).toHaveTextContent('TradingAgents');
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
