// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { App } from '../../src/frontend/app/app';

const authState = vi.hoisted(() => ({
  role: 'admin' as 'admin' | 'user',
}));

const authMocks = vi.hoisted(() => ({
  listManagedUsers: vi.fn(),
  updateManagedUserRole: vi.fn(),
  adjustManagedUserCredits: vi.fn(),
}));

vi.mock('../../src/frontend/hooks/use-auth-session', () => ({
  useAuthSession: () => ({
    data: {
      data: {
        authenticated: true,
        session: { id: 'session-1' },
        user: {
          id: 'user-1',
          displayName: 'Admin User',
          email: 'admin@example.test',
          imageUrl: '',
          role: authState.role,
        },
      },
    },
    isError: false,
    isLoading: false,
  }),
}));

vi.mock('../../src/frontend/lib/auth', () => authMocks);

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
});

beforeEach(() => {
  authState.role = 'admin';
  authMocks.listManagedUsers.mockResolvedValue({
    data: {
      users: [
        {
          id: 'user-1',
          displayName: 'Admin User',
          email: 'admin@example.test',
          imageUrl: '',
          role: 'admin',
          createdAt: 1,
          availableCredits: 500,
        },
        {
          id: 'user-2',
          displayName: 'Ada Lovelace',
          email: 'ada@example.test',
          imageUrl: '',
          role: 'user',
          createdAt: 2,
          availableCredits: 100,
        },
      ],
      totalCount: 2,
    },
    requestId: 'request-1',
  });
  authMocks.adjustManagedUserCredits.mockResolvedValue({
    data: { availableCredits: 75 },
    requestId: 'request-2',
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('shows user management navigation and role controls to administrators', async () => {
  render(
    <MemoryRouter initialEntries={['/admin/users']}>
      <App />
    </MemoryRouter>,
  );

  expect(
    screen.getByRole('link', { name: 'User management' }),
  ).toBeInTheDocument();
  expect(
    await screen.findByRole('heading', { name: 'Users and roles' }),
  ).toBeInTheDocument();
  expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
  expect(
    screen.getByRole('combobox', { name: 'Role for Ada Lovelace' }),
  ).toBeEnabled();
  expect(
    screen.getByRole('combobox', { name: 'Role for Admin User' }),
  ).toBeDisabled();
});

it('lets an administrator decrease user credits from the adjustment dialog', async () => {
  render(
    <MemoryRouter initialEntries={['/admin/users']}>
      <App />
    </MemoryRouter>,
  );

  expect(await screen.findByText('100')).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Adjust credits for Ada Lovelace' }),
  );
  fireEvent.click(screen.getByRole('radio', { name: 'Decrease' }));
  fireEvent.change(screen.getByLabelText('Points'), {
    target: { value: '25' },
  });
  fireEvent.change(screen.getByLabelText('Note'), {
    target: { value: 'Correction' },
  });
  expect(screen.getByText('Balance after adjustment: 75')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Apply adjustment' }));

  await waitFor(() =>
    expect(authMocks.adjustManagedUserCredits).toHaveBeenCalledWith('user-2', {
      adjustmentId: expect.any(String),
      delta: -25,
      reason: 'Correction',
    }),
  );
});

it('does not expose user data to a regular user on the admin route', () => {
  authState.role = 'user';

  render(
    <MemoryRouter initialEntries={['/admin/users']}>
      <App />
    </MemoryRouter>,
  );

  expect(screen.getByText('Administrator access required')).toBeInTheDocument();
  expect(authMocks.listManagedUsers).not.toHaveBeenCalled();
  expect(
    screen.queryByRole('link', { name: 'User management' }),
  ).not.toBeInTheDocument();
});
