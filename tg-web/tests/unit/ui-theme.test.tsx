// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';

import { App } from '../../src/frontend/app/app';
import { UI_THEME_STORAGE_KEY } from '../../src/frontend/lib/theme';

it('switches the app between light and dark color themes', async () => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  );

  const darkButton = await screen.findByRole('button', { name: 'Dark' });
  fireEvent.click(darkButton);

  await waitFor(() => {
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
  expect(localStorage.getItem(UI_THEME_STORAGE_KEY)).toBe('dark');

  fireEvent.click(screen.getByRole('button', { name: 'Light' }));

  await waitFor(() => {
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
  expect(localStorage.getItem(UI_THEME_STORAGE_KEY)).toBe('light');
});
