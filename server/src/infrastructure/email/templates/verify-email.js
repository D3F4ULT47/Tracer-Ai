export function createVerificationEmail({ email, token, appUrl }) {
  const url = new URL('/verify-email', appUrl);
  url.searchParams.set('token', token);
  return {
    to: email,
    subject: 'Verify your Tracer AI email',
    text: `Verify your email by opening this link: ${url}`,
    html: `<p>Verify your email to continue with Tracer AI.</p><p><a href="${url}">Verify email</a></p>`,
  };
}
