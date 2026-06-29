import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../components/Button/index.js';
import { Card } from '../components/Card/index.js';
import { Input } from '../components/Input/index.js';
import { Loader } from '../components/Loader/index.js';
import { Modal } from '../components/Modal/index.js';
import { Toast } from '../components/Toast/index.js';
import { authApi } from '../features/auth/api/auth-api.js';
import { useLogin } from '../features/auth/hooks/use-auth.js';
import { clientEnv } from '../config/env.js';

export function LoginPage() {
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotState, setForgotState] = useState({ status: 'idle', message: '' });

  async function submit(event) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    await login.mutateAsync(body);
    navigate(location.state?.from?.pathname ?? '/dashboard', { replace: true });
  }

  async function forgot(event) {
    event.preventDefault();
    setForgotState({ status: 'loading', message: '' });
    try {
      const email = new FormData(event.currentTarget).get('email');
      const result = await authApi.forgotPassword(email);
      setForgotState({ status: 'success', message: result.message });
    } catch (error) {
      setForgotState({ status: 'error', message: error.message });
    }
  }

  return (
    <section className="auth-page">
      <Card className="auth-card">
        <h1>Welcome back</h1>
        {login.isError ? <Toast tone="error">{login.error.message}</Toast> : null}
        {login.isSuccess ? <Toast>Signed in successfully.</Toast> : null}
        <form onSubmit={submit} className="form-stack">
          <Input
            id="login-email"
            name="email"
            type="email"
            label="Email"
            required
            autoComplete="email"
          />
          <Input
            id="login-password"
            name="password"
            type="password"
            label="Password"
            required
            autoComplete="current-password"
            minLength="12"
          />
          <Button variant="primary" disabled={login.isPending}>
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <Button type="button" variant="link" onClick={() => setForgotOpen(true)}>
          Forgot password?
        </Button>
        {clientEnv.VITE_GOOGLE_OAUTH_ENABLED ? (
          <a className="ui-button ui-button--oauth" href={authApi.oauthUrl('google')}>
            Continue with Google
          </a>
        ) : null}
        <p>
          New to Tracer AI? <Link to="/signup">Create an account</Link>
        </p>
      </Card>
      <Modal open={forgotOpen} title="Reset password" onClose={() => setForgotOpen(false)}>
        {forgotState.status === 'loading' ? <Loader label="Sending reset email" /> : null}
        {forgotState.status === 'error' ? <Toast tone="error">{forgotState.message}</Toast> : null}
        {forgotState.status === 'success' ? <Toast>{forgotState.message}</Toast> : null}
        {forgotState.status !== 'success' ? (
          <form onSubmit={forgot} className="form-stack">
            <Input id="forgot-email" name="email" type="email" label="Email" required />
            <Button variant="primary">Send reset link</Button>
          </form>
        ) : null}
      </Modal>
    </section>
  );
}
