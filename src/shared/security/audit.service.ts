import { AuditOutcome } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';

export interface AuditEventParams {
  actorId?: string;
  actorRole?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  outcome?: AuditOutcome;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;
}

export class AuditService {
  /**
   * Sanitizes metadata to guarantee no passwords, raw tokens, or raw medical data are logged
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sanitizeMetadata(meta?: Record<string, any>): Record<string, any> | undefined {
    if (!meta) return undefined;
    const sanitized = { ...meta };
    const sensitiveKeys = [
      'password',
      'passwordHash',
      'token',
      'accessToken',
      'refreshToken',
      'secret',
      'mfaSecret',
      'mfaRecoveryCodes',
      'diagnosis',
      'medications',
    ];

    for (const key of sensitiveKeys) {
      if (key in sanitized) {
        sanitized[key] = '[REDACTED]';
      }
    }
    return sanitized;
  }

  /**
   * Records an immutable audit log entry in the database
   */
  async record(params: AuditEventParams): Promise<void> {
    try {
      const sanitizedMeta = this.sanitizeMetadata(params.metadata);

      await prisma.auditLog.create({
        data: {
          actorId: params.actorId || null,
          actorRole: params.actorRole || null,
          action: params.action,
          resourceType: params.resourceType,
          resourceId: params.resourceId || null,
          outcome: params.outcome || AuditOutcome.SUCCESS,
          ipAddress: params.ipAddress || null,
          userAgent: params.userAgent ? params.userAgent.substring(0, 500) : null,
          correlationId: params.correlationId || null,
          metadata: sanitizedMeta || undefined,
        },
      });

      logger.info(
        {
          auditAction: params.action,
          actorId: params.actorId,
          resourceType: params.resourceType,
          resourceId: params.resourceId,
          outcome: params.outcome || AuditOutcome.SUCCESS,
          correlationId: params.correlationId,
        },
        'Audit event recorded'
      );
    } catch (err) {
      // Never let an audit logging failure crash the primary business flow, but log error with high priority
      logger.error({ error: err, auditParams: params }, 'Failed to persist audit log entry');
    }
  }
}

export const auditService = new AuditService();
