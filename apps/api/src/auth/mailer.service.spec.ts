import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from './mailer.service.js';

describe('MailerService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('creates verification and reset links for local development', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const service = new MailerService(new ConfigService({
      NODE_ENV: 'development',
      FRONTEND_URL: 'https://nexa.example',
    }));

    await service.sendVerification('user@example.test', 'verify-token');
    await service.sendPasswordReset('user@example.test', 'reset-token');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('verify-email?token=verify-token'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('reset-password?token=reset-token'));
  });

  it('rejects production startup without SMTP credentials', () => {
    expect(() => new MailerService(new ConfigService({
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://nexa.example',
    }))).toThrow('SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASSWORD are required in production.');
  });
});
