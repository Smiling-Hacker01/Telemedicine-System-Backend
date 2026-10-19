import { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { UnprocessableEntityError } from '../errors/app-error.js';

export async function idempotencyMiddleware(request: FastifyRequest, reply: FastifyReply) {
  // Only apply to state-modifying HTTP methods
  if (!['POST', 'PATCH', 'PUT'].includes(request.method)) {
    return;
  }

  const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
  if (!idempotencyKey || idempotencyKey.trim().length === 0) {
    return; // Optional unless strictly enforced by specific endpoints
  }

  const cleanKey = idempotencyKey.trim();
  const requestBodyStr = request.body ? JSON.stringify(request.body) : '';
  const requestHash = crypto
    .createHash('sha256')
    .update(`${request.url}:${requestBodyStr}`)
    .digest('hex');

  try {
    const existing = await prisma.idempotencyRecord.findUnique({
      where: { key: cleanKey },
    });

    if (existing) {
      if (existing.expiresAt < new Date()) {
        // Expired record, remove and allow re-execution
        await prisma.idempotencyRecord.delete({ where: { key: cleanKey } });
      } else if (existing.requestHash !== requestHash) {
        throw new UnprocessableEntityError(
          'Idempotency key was previously used with a different request payload or endpoint'
        );
      } else {
        // Cache HIT: Replay the identical response
        logger.info({ idempotencyKey: cleanKey }, 'Idempotency key hit — replaying cached response');
        reply
          .status(existing.statusCode)
          .header('x-idempotent-replay', 'true')
          .header('content-type', 'application/json; charset=utf-8')
          .send(existing.responseBody);
        return;
      }
    }
  } catch (err) {
    if (err instanceof UnprocessableEntityError) {
      throw err;
    }
    logger.warn({ error: err, idempotencyKey: cleanKey }, 'Idempotency lookup warning');
  }
}

/**
 * Persists an idempotent response after handler execution
 */
export async function saveIdempotentResponse(
  key: string,
  resourcePath: string,
  statusCode: number,
  responseBody: unknown,
  requestBody: unknown
): Promise<void> {
  try {
    const requestBodyStr = requestBody ? JSON.stringify(requestBody) : '';
    const requestHash = crypto
      .createHash('sha256')
      .update(`${resourcePath}:${requestBodyStr}`)
      .digest('hex');

    const bodyStr = typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours retention

    await prisma.idempotencyRecord.upsert({
      where: { key },
      update: {
        statusCode,
        responseBody: bodyStr,
        requestHash,
        expiresAt,
      },
      create: {
        key,
        resourcePath,
        statusCode,
        responseBody: bodyStr,
        requestHash,
        expiresAt,
      },
    });
  } catch (err) {
    logger.error({ error: err, key }, 'Failed to save idempotent response');
  }
}
