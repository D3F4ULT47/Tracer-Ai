import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '../components/Button/index.js';
import { Card } from '../components/Card/index.js';
import { Input, PasswordInput } from '../components/Input/index.js';
import { Toast } from '../components/Toast/index.js';
import { authApi } from '../features/auth/api/auth-api.js';
import { consumeAuthReturn } from '../features/auth/auth-return.js';
import { authKeys } from '../features/auth/hooks/use-auth.js';
import { clientEnv } from '../config/env.js';

export function SignupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const redirectedEmail = location.state?.email ?? '';
  const [mismatch, setMismatch] = useState(false);

  const signup = useMutation({
    async mutationFn(credentials) {
      const registration = await authApi.register(credentials);
      if (!registration.data.user.emailVerified) {
        return { authenticated: false, registration };
      }
      const login = await authApi.login({
        email: credentials.email,
        password: credentials.password,
      });
      return { authenticated: true, displayName: credentials.name, login, registration };
    },
    async onSuccess(result) {
      if (!result.authenticated) return;
      queryClient.setQueryData(authKeys.me, {
        ...result.login,
        data: {
          ...result.login.data,
          user: { ...result.login.data.user, name: result.displayName },
        },
      });
      navigate(consumeAuthReturn('/'), { replace: true });
    },
  });
  function submit(event) {
    event.preventDefault();
    const { confirmPassword, ...credentials } = Object.fromEntries(
      new FormData(event.currentTarget),
    );
    if (confirmPassword !== credentials.password) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    signup.mutate(credentials);
  }
  return (
    <section className="auth-page">
      <Card className="auth-card">
        <div className="auth-header">
          <p className="eyebrow">Authentication</p>
          <h1>Create your account</h1>
          <p className="auth-subtitle">
            Start with a secure Tracer AI workspace and generate your first personalized roadmap.
          </p>
        </div>
        {redirectedEmail && !signup.isSuccess ? (
          <Toast>No account exists for {redirectedEmail} yet. Create one below.</Toast>
        ) : null}
        {signup.isError ? <Toast tone="error">{signup.error.message}</Toast> : null}
        {signup.isSuccess && !signup.data.authenticated ? (
          <Toast>{signup.data.registration.message}</Toast>
        ) : null}
        {!signup.isSuccess || signup.data.authenticated ? (
          <form onSubmit={submit} className="form-stack">
            <Input id="signup-name" name="name" label="Name" required maxLength="100" />
            <Input
              id="signup-email"
              name="email"
              type="email"
              label="Email"
              required
              autoComplete="email"
              defaultValue={redirectedEmail}
            />
            <PasswordInput
              id="signup-password"
              name="password"
              label="Password"
              required
              minLength="12"
              autoComplete="new-password"
            />
            <PasswordInput
              id="signup-confirm-password"
              name="confirmPassword"
              label="Confirm password"
              required
              minLength="12"
              autoComplete="new-password"
              error={mismatch ? 'Passwords do not match.' : null}
              onChange={() => setMismatch(false)}
            />
            <Button variant="primary" disabled={signup.isPending}>
              {signup.isPending ? 'Creating your workspace…' : 'Create account'}
            </Button>
          </form>
        ) : null}
        {clientEnv.VITE_GOOGLE_OAUTH_ENABLED ? (
          <a className="ui-button ui-button--oauth" href={authApi.oauthUrl('google')}>
            <ArrowRight size={16} />
            Sign up with Google
          </a>
        ) : null}
        <p className="auth-card-footer">
          Already registered? <Link to="/login">Log in</Link>
        </p>
        {!signup.isSuccess ? (
          <p className="muted auth-note">
            Email verification remains part of the sign-up flow and is not exposed in navigation.
          </p>
        ) : null}
      </Card>
    </section>
  );
}
