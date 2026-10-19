import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

export async function correlationIdMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const existingCorrelationId = request.headers['x-correlation-id'] as string | undefined;
  const correlationId = existingCorrelationId && existingCorrelationId.trim().length > 0
    ? existingCorrelationId
    : uuidv4();

  request.correlationId = correlationId;
  reply.header('x-correlation-id', correlationId);
}
