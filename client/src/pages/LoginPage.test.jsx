import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { LoginPage } from './LoginPage.jsx';

const mocks = vi.hoisted(() => ({ login: vi.fn() }));

vi.mock('../features/auth/api/auth-api.js', () => ({
  authApi: { login: mocks.login, oauthUrl: () => '/oauth/google' },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function SignupProbe() {
  const location = useLocation();
  return <h1>Signup for {location.state?.email}</h1>;
}

function renderLogin() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupProbe />} />
          <Route path="/" element={<h1>Home</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function signIn(email) {
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: 'Email' }), email);
  await user.type(screen.getByLabelText('Password', { selector: 'input' }), 'SecurePassword!2026');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

it('switches to signup with the email when no account exists', async () => {
  mocks.login.mockRejectedValue(
    Object.assign(new Error('No account exists for this email'), { code: 'ACCOUNT_NOT_FOUND' }),
  );
  renderLogin();
  await signIn('new@example.com');

  expect(
    await screen.findByRole('heading', { name: 'Signup for new@example.com' }),
  ).toBeInTheDocument();
});

it('stays on login and shows the error for a wrong password', async () => {
  mocks.login.mockRejectedValue(
    Object.assign(new Error('Invalid email or password'), { code: 'INVALID_CREDENTIALS' }),
  );
  renderLogin();
  await signIn('known@example.com');

  expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
});

it('has an eye button that reveals the password', async () => {
  renderLogin();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Show password' }));
  expect(screen.getByLabelText('Password', { selector: 'input' })).toHaveAttribute('type', 'text');
});
