import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load corresponding .env file based on NODE_ENV
const nodeEnv = process.env.NODE_ENV || 'development';
if (nodeEnv === 'test') {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });
} else {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // Database
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MIN: z.coerce.number().default(2),
  DATABASE_POOL_MAX: z.coerce.number().default(50),

  // Redis
  REDIS_URL: z.string().url().default('redis://localhost:6380'),
  REDIS_KEY_PREFIX: z.string().default('amrutam:'),
  CACHE_DEFAULT_TTL_SEC: z.coerce.number().default(300),

  // Authentication & Security
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  PASSWORD_SALT_ROUNDS: z.coerce.number().default(12),

  // MFA
  MFA_APP_NAME: z.string().default('Amrutam Telemedicine'),
  MFA_ENCRYPTION_KEY: z.string().length(64, 'MFA_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)'),

  // PHI & Prescription Encryption (AES-256-GCM)
  DATA_ENCRYPTION_KEY: z.string().length(64, 'DATA_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)'),

  // Rate Limiting
  RATE_LIMIT_MAX_PER_MINUTE: z.coerce.number().default(120),
  AUTH_RATE_LIMIT_MAX_PER_MINUTE: z.coerce.number().default(10),

  // Payment Webhook
  PAYMENT_WEBHOOK_SECRET: z.string().min(32),
  PAYMENT_PROVIDER: z.string().default('mock'),

  // CORS
  CORS_ORIGIN: z.string().default('*'),
});

export type Environment = z.infer<typeof environmentSchema>;

function validateEnv(): Environment {
  const result = environmentSchema.safeParse(process.env);
  if (!result.success) {
    const errorDetails = result.error.errors
      .map((err) => `${err.path.join('.')}: ${err.message}`)
      .join('\n');
    console.error('CRITICAL: Environment validation failure:\n' + errorDetails);
    throw new Error(`Environment validation failed:\n${errorDetails}`);
  }
  return result.data;
}

export const env = validateEnv();
