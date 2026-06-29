import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '../components/Button/index.js';
import { Card } from '../components/Card/index.js';
import { Input } from '../components/Input/index.js';
import { Toast } from '../components/Toast/index.js';
import { authApi } from '../features/auth/api/auth-api.js';

export function SignupPage() {
  const signup = useMutation({ mutationFn: authApi.register });
  function submit(event) {
    event.preventDefault();
    signup.mutate(Object.fromEntries(new FormData(event.currentTarget)));
  }
  return (
    <section className="auth-page">
      <Card className="auth-card">
        <h1>Create your account</h1>
        {signup.isError ? <Toast tone="error">{signup.error.message}</Toast> : null}
        {signup.isSuccess ? <Toast>{signup.data.message}</Toast> : null}
        {!signup.isSuccess ? (
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
              {signup.isPending ? 'Creating…' : 'Create account'}
            </Button>
          </form>
        ) : null}
        <p>
          Already registered? <Link to="/login">Log in</Link>
        </p>
      </Card>
    </section>
  );
}
