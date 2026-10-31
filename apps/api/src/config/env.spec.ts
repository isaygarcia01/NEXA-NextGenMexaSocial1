import { validateEnvironment } from './env.js';

describe('environment configuration', () => {
  it('provides local development defaults', () => {
    const config = validateEnvironment({});
    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(3001);
    expect(config.MAX_UPLOAD_BYTES).toBe(10_000_000);
  });

  it('requires production secrets and real external credentials', () => {
    expect(() => validateEnvironment({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://user:password@db:5432/nexa',
      REDIS_URL: 'redis://:password@redis:6379',
      S3_ACCESS_KEY: 'access-key',
      S3_SECRET_KEY: 'secret-key-at-least-eight',
      JWT_ACCESS_SECRET: 'production-jwt-signing-secret-with-thirty-two-characters',
      SMTP_HOST: 'mail.example',
      SMTP_PORT: 587,
      SMTP_USER: 'mailer',
      SMTP_PASSWORD: 'mail-secret',
    })).not.toThrow();

    expect(() => validateEnvironment({
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: 'local-development-access-secret-change-before-deploy',
    })).toThrow(/JWT_ACCESS_SECRET must be replaced/);
  });

  it('rejects malformed configuration and the development JWT secret in production', () => {
    expect(() => validateEnvironment({ PORT: 'not-a-port' })).toThrow(/Invalid environment configuration/);
    expect(() => validateEnvironment({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://user:password@db:5432/nexa',
      REDIS_URL: 'redis://:password@redis:6379',
      S3_ACCESS_KEY: 'access-key',
      S3_SECRET_KEY: 'secret-key-at-least-eight',
      JWT_ACCESS_SECRET: 'local-development-access-secret-change-before-deploy',
      SMTP_HOST: 'mail.example',
      SMTP_PORT: 587,
      SMTP_USER: 'mailer',
      SMTP_PASSWORD: 'mail-secret',
    })).toThrow(/JWT_ACCESS_SECRET must be replaced/);
  });
});
