import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { authKeys } from '../features/auth/hooks/use-auth.js';
import { rememberAuthReturn } from '../features/auth/auth-return.js';
import { SignupPage } from './SignupPage.jsx';

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  login: vi.fn(),
}));

vi.mock('../features/auth/api/auth-api.js', () => ({
  authApi: {
    register: mocks.register,
    login: mocks.login,
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  sessionStorage.clear();
});

it('returns a verified signup to the pending roadmap preview', async () => {
  rememberAuthReturn('/roadmaps/preview');
  mocks.register.mockResolvedValue({
    message: 'Account created',
    data: { user: { email: 'new@example.com', emailVerified: true } },
  });
  mocks.login.mockResolvedValue({
    message: 'Signed in',
    data: { user: { email: 'new@example.com', emailVerified: true } },
  });
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/signup']}>
        <Routes>
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/roadmaps/preview" element={<h1>Pending roadmap preview</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'New Learner');
  await user.type(screen.getByRole('textbox', { name: 'Email' }), 'new@example.com');
  await user.type(screen.getByLabelText('Password'), 'SecurePassword!2026');
  await user.click(screen.getByRole('button', { name: 'Create account' }));

  expect(
    await screen.findByRole('heading', { name: 'Pending roadmap preview' }),
  ).toBeInTheDocument();
});

it('signs a verified new user in and navigates directly home', async () => {
  mocks.register.mockResolvedValue({
    message: 'Account created',
    data: { user: { email: 'new@example.com', emailVerified: true } },
  });
  mocks.login.mockResolvedValue({
    message: 'Signed in',
    data: { user: { email: 'new@example.com', emailVerified: true } },
  });
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/signup']}>
        <Routes>
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/" element={<h1>Roadmap home</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'New Learner');
  await user.type(screen.getByRole('textbox', { name: 'Email' }), 'new@example.com');
  await user.type(screen.getByLabelText('Password'), 'SecurePassword!2026');
  await user.click(screen.getByRole('button', { name: 'Create account' }));

  expect(await screen.findByRole('heading', { name: 'Roadmap home' })).toBeInTheDocument();
  expect(mocks.register).toHaveBeenCalledWith({
    name: 'New Learner',
    email: 'new@example.com',
    password: 'SecurePassword!2026',
  });
  expect(mocks.login).toHaveBeenCalledWith({
    email: 'new@example.com',
    password: 'SecurePassword!2026',
  });
  expect(queryClient.getQueryData(authKeys.me).data.user.name).toBe('New Learner');
});
