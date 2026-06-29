import { useMutation } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '../components/Button/index.js';
import { Card } from '../components/Card/index.js';
import { Input } from '../components/Input/index.js';
import { Toast } from '../components/Toast/index.js';
import { authApi } from '../features/auth/api/auth-api.js';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const mutation = useMutation({
    mutationFn: ({ password }) => authApi.resetPassword(token, password),
  });
  function submit(event) {
    event.preventDefault();
    mutation.mutate(Object.fromEntries(new FormData(event.currentTarget)));
  }
  return (
    <section className="auth-page">
      <Card className="auth-card">
        <h1>Reset password</h1>
        {!token ? <Toast tone="error">The reset link is incomplete.</Toast> : null}
        {mutation.isError ? <Toast tone="error">{mutation.error.message}</Toast> : null}
        {mutation.isSuccess ? (
          <>
            <Toast>Password reset successfully.</Toast>
            <Link to="/login">Log in</Link>
          </>
        ) : token ? (
          <form onSubmit={submit} className="form-stack">
            <Input
              id="reset-password"
              name="password"
              type="password"
              label="New password"
              minLength="12"
              required
            />
            <Button variant="primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Resetting…' : 'Reset password'}
            </Button>
          </form>
        ) : null}
      </Card>
    </section>
  );
}
