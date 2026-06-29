import { useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card } from '../components/Card/index.js';
import { Loader } from '../components/Loader/index.js';
import { Toast } from '../components/Toast/index.js';
import { authApi } from '../features/auth/api/auth-api.js';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const mutation = useMutation({ mutationFn: authApi.verifyEmail });
  const token = params.get('token');
  useEffect(() => {
    if (token && mutation.isIdle) mutation.mutate(token);
  }, [token, mutation]);
  return (
    <section className="auth-page">
      <Card className="auth-card">
        <h1>Verify email</h1>
        {!token ? <Toast tone="error">The verification link is incomplete.</Toast> : null}
        {mutation.isPending ? <Loader label="Verifying your email" /> : null}
        {mutation.isError ? <Toast tone="error">{mutation.error.message}</Toast> : null}
        {mutation.isSuccess ? <Toast>Email verified successfully.</Toast> : null}
        <Link to="/login">Continue to login</Link>
      </Card>
    </section>
  );
}
