import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, KeyRound } from 'lucide-react';
import { Button } from '../components/Button/index.js';
import { Card } from '../components/Card/index.js';
import { Input } from '../components/Input/index.js';
import { Loader } from '../components/Loader/index.js';
import { Modal } from '../components/Modal/index.js';
import { Toast } from '../components/Toast/index.js';
import { authApi } from '../features/auth/api/auth-api.js';
import { consumeAuthReturn, rememberAuthReturn } from '../features/auth/auth-return.js';
import { useLogin } from '../features/auth/hooks/use-auth.js';
import { clientEnv } from '../config/env.js';

export function LoginPage() {
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotState, setForgotState] = useState({ status: 'idle', message: '' });

  useEffect(() => {
    if (location.state?.from) rememberAuthReturn(location.state.from);
  }, [location.state]);

  async function submit(event) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    await login.mutateAsync(body);
    navigate(consumeAuthReturn('/'), { replace: true });
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
        <div className="auth-header">
          <p className="eyebrow">Authentication</p>
          <h1>Welcome back</h1>
          <p className="auth-subtitle">
            Sign in to continue managing your learning roadmaps, profile settings, and connected
            accounts.
          </p>
        </div>
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
        <div className="auth-actions-row">
          <Button type="button" variant="link" onClick={() => setForgotOpen(true)}>
            Forgot password?
          </Button>
        </div>
        {clientEnv.VITE_GOOGLE_OAUTH_ENABLED ? (
          <a className="ui-button ui-button--oauth" href={authApi.oauthUrl('google')}>
            <ArrowRight size={16} />
            Continue with Google
          </a>
        ) : null}
        <p className="auth-card-footer">
          New to Tracer AI? <Link to="/signup">Create an account</Link>
        </p>
      </Card>
      <Modal open={forgotOpen} title="Reset password" onClose={() => setForgotOpen(false)}>
        {forgotState.status === 'loading' ? <Loader label="Sending reset email" /> : null}
        {forgotState.status === 'error' ? <Toast tone="error">{forgotState.message}</Toast> : null}
        {forgotState.status === 'success' ? <Toast>{forgotState.message}</Toast> : null}
        {forgotState.status !== 'success' ? (
          <form onSubmit={forgot} className="form-stack">
            <p className="muted">
              Enter the email linked to your account and we&apos;ll send a secure reset link.
            </p>
            <Input id="forgot-email" name="email" type="email" label="Email" required />
            <Button variant="primary">
              <KeyRound size={16} />
              Send reset link
            </Button>
          </form>
        ) : null}
      </Modal>
    </section>
  );
}
