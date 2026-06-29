import { Resend } from 'resend';
import { env } from '../../../config/env.js';
import { EmailProvider } from '../email-provider.js';

export class ResendEmailProvider extends EmailProvider {
  #client;

  constructor(apiKey = env.RESEND_API_KEY) {
    super();
    this.#client = apiKey ? new Resend(apiKey) : null;
  }

  async send(message) {
    if (!this.#client || !env.EMAIL_FROM) throw new Error('Transactional email is not configured');
    const { error } = await this.#client.emails.send({ from: env.EMAIL_FROM, ...message });
    if (error) throw new Error(`Email delivery failed: ${error.message}`);
  }
}
