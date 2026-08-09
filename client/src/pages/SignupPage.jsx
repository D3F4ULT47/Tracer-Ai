import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/Button/index.js';
import { Card } from '../components/Card/index.js';
import { Input } from '../components/Input/index.js';
import { Toast } from '../components/Toast/index.js';
import { authApi } from '../features/auth/api/auth-api.js';
import { consumeAuthReturn } from '../features/auth/auth-return.js';
import { authKeys } from '../features/auth/hooks/use-auth.js';

export function SignupPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
    signup.mutate(Object.fromEntries(new FormData(event.currentTarget)));
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
        {signup.isError ? <Toast tone="error">{signup.error.message}</Toast> : null}
        {signup.isSuccess && !signup.data.authenticated ? (
          <Toast>{signup.data.registration.message}</Toast>
        ) : null}
        {!signup.isSuccess || signup.data.authenticated ? (
          <form onSubmit={submit} className="form-stack">
            <Input id="signup-name" name="name" label="Name" required maxLength="100" />
            <Input id="signup-email" name="email" type="email" label="Email" required />
            <Input
              id="signup-password"
              name="password"
              type="password"
              label="Password"
              required
              minLength="12"
            />
            <Button variant="primary" disabled={signup.isPending}>
              {signup.isPending ? 'Creating your workspace…' : 'Create account'}
            </Button>
          </form>
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
