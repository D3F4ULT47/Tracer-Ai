import { env } from '../../config/env.js';
import { ResendEmailProvider } from './providers/resend-email.provider.js';
import { createResetPasswordEmail } from './templates/reset-password.js';
import { createVerificationEmail } from './templates/verify-email.js';

export class EmailService {
  constructor(provider = new ResendEmailProvider()) {
    this.provider = provider;
  }

  sendVerification(payload) {
    return this.provider.send(createVerificationEmail({ ...payload, appUrl: env.APP_URL }));
  }

  sendPasswordReset(payload) {
    return this.provider.send(createResetPasswordEmail({ ...payload, appUrl: env.APP_URL }));
  }
}

export const emailService = new EmailService();
