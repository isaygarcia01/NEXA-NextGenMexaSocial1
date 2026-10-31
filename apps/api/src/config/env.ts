import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().url().default('postgresql://nexa:local_only_change_me@localhost:5432/nexa'),
  REDIS_URL: z.string().url().default('redis://:local_only_change_me@localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(32).default('local-development-access-secret-change-before-deploy'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  S3_ENDPOINT: z.string().url().default('http://localhost:9000'),
  S3_PUBLIC_ENDPOINT: z.string().url().default('http://localhost:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('nexa-media'),
  S3_ACCESS_KEY: z.string().default('nexa_local'),
  S3_SECRET_KEY: z.string().min(8).default('local_only_change_me_123'),
  S3_PUBLIC_URL: z.string().url().default('http://localhost:9000/nexa-media'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().max(20_000_000).default(10_000_000),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.preprocess(
    (value) => value === '' ? undefined : value,
    z.coerce.number().int().positive().optional(),
  ),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default('NEXA <no-reply@nexa.local>'),
});

export type AppConfig = z.infer<typeof envSchema>;

export function validateEnvironment(config: Record<string, unknown>): AppConfig {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${z.prettifyError(parsed.error)}`);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.JWT_ACCESS_SECRET.startsWith('local-')) {
    throw new Error('JWT_ACCESS_SECRET must be replaced with a production secret.');
  }
  if (parsed.data.NODE_ENV === 'production') {
    const required = ['DATABASE_URL', 'REDIS_URL', 'JWT_ACCESS_SECRET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY',
      'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD'];
    const missing = required.filter((key) => config[key] === undefined || config[key] === '');
    if (missing.length) throw new Error(`Missing production environment variables: ${missing.join(', ')}`);
    const unsafe = [
      parsed.data.DATABASE_URL.includes('local_only_change_me'),
      parsed.data.REDIS_URL.includes('local_only_change_me'),
      parsed.data.S3_ACCESS_KEY === 'nexa_local',
      parsed.data.S3_SECRET_KEY.startsWith('local_only'),
    ];
    if (unsafe.some(Boolean)) {
      throw new Error('Local development credentials cannot be used in production.');
    }
  }
  return parsed.data;
}
