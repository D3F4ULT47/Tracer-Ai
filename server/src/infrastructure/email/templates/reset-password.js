export function createResetPasswordEmail({ email, token, appUrl }) {
  const url = new URL('/reset-password', appUrl);
  url.searchParams.set('token', token);
  return {
    to: email,
    subject: 'Reset your Tracer AI password',
    text: `Reset your password by opening this link: ${url}`,
    html: `<p>A password reset was requested for your account.</p><p><a href="${url}">Reset password</a></p>`,
  };
}
