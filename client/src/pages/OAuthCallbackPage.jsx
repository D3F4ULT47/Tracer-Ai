import { Navigate, useSearchParams } from 'react-router-dom';
import { Card } from '../components/Card/index.js';
import { Toast } from '../components/Toast/index.js';
import { consumeAuthReturn } from '../features/auth/auth-return.js';

export function OAuthCallbackPage() {
  const [params] = useSearchParams();
  if (params.get('status') === 'success') {
    return <Navigate to={consumeAuthReturn('/')} replace />;
  }
  return (
    <section className="auth-page">
      <Card className="auth-card">
        <Toast tone="error">OAuth sign-in could not be completed.</Toast>
      </Card>
    </section>
  );
}
