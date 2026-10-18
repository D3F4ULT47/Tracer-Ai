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
  await user.type(screen.getByLabelText('Password', { selector: 'input' }), 'SecurePassword!2026');
  await user.type(
    screen.getByLabelText('Confirm password', { selector: 'input' }),
    'SecurePassword!2026',
  );
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
  await user.type(screen.getByLabelText('Password', { selector: 'input' }), 'SecurePassword!2026');
  await user.type(
    screen.getByLabelText('Confirm password', { selector: 'input' }),
    'SecurePassword!2026',
  );
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

function renderSignup(initialEntry = '/signup') {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/signup" element={<SignupPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it('blocks signup when the two passwords differ', async () => {
  renderSignup();
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'New Learner');
  await user.type(screen.getByRole('textbox', { name: 'Email' }), 'new@example.com');
  await user.type(screen.getByLabelText('Password', { selector: 'input' }), 'SecurePassword!2026');
  await user.type(
    screen.getByLabelText('Confirm password', { selector: 'input' }),
    'SecurePassword!2027',
  );
  await user.click(screen.getByRole('button', { name: 'Create account' }));

  expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
  expect(mocks.register).not.toHaveBeenCalled();
});

it('shows and hides the password with the eye button', async () => {
  renderSignup();
  const user = userEvent.setup();
  const password = screen.getByLabelText('Password', { selector: 'input' });
  expect(password).toHaveAttribute('type', 'password');
  await user.click(screen.getByRole('button', { name: 'Show password' }));
  expect(password).toHaveAttribute('type', 'text');
  await user.click(screen.getByRole('button', { name: 'Hide password' }));
  expect(password).toHaveAttribute('type', 'password');
});

it('prefills the email when login found no account', () => {
  renderSignup({ pathname: '/signup', state: { email: 'new@example.com' } });
  expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('new@example.com');
  expect(screen.getByText(/No account exists for new@example.com/)).toBeInTheDocument();
});
