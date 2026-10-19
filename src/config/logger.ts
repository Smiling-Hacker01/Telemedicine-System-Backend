import pino from 'pino';
import { env } from './environment.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-idempotency-key"]',
      'password',
      'passwordHash',
      'token',
      'accessToken',
      'refreshToken',
      'mfaSecret',
      'mfaRecoveryCodes',
      'cardDetails',
      'diagnosis',
      'medications',
    ],
    censor: '[REDACTED]',
  },
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});
