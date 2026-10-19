import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { Prisma } from '@prisma/client';
import { AppError } from '../shared/errors/app-error.js';
import { ApiErrorResponse } from '../shared/types/api.types.js';
import { logger } from '../config/logger.js';
import { env } from '../config/environment.js';

export function errorHandler(error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) {
  const correlationId = request.correlationId || 'unknown';
  const instance = request.url;
  const timestamp = new Date().toISOString();

  // 1. Handled Domain AppError
  if (error instanceof AppError) {
    const errorResponse: ApiErrorResponse = {
      type: `https://api.amrutam.co.in/errors/${error.errorCode.toLowerCase()}`,
      title: error.name,
      status: error.statusCode,
      detail: error.message,
      instance,
      errorCode: error.errorCode,
      correlationId,
      timestamp,
      errors: error.details,
    };

    if (error.statusCode >= 500) {
      logger.error({ error, correlationId, url: request.url }, 'Internal Server Error occurred');
    } else {
      logger.warn({ errorCode: error.errorCode, message: error.message, correlationId }, 'Client operational error');
    }

    return reply.status(error.statusCode).send(errorResponse);
  }

  // 2. Prisma Database Errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const target = (error.meta?.target as string[])?.join(', ') || 'field';
      const errorResponse: ApiErrorResponse = {
        type: 'https://api.amrutam.co.in/errors/conflict',
        title: 'ConflictError',
        status: 409,
        detail: `A record with this ${target} already exists`,
        instance,
        errorCode: 'UNIQUE_CONSTRAINT_VIOLATION',
        correlationId,
        timestamp,
      };
      return reply.status(409).send(errorResponse);
    }

    if (error.code === 'P2025') {
      const errorResponse: ApiErrorResponse = {
        type: 'https://api.amrutam.co.in/errors/not-found',
        title: 'NotFoundError',
        status: 404,
        detail: 'The requested resource was not found',
        instance,
        errorCode: 'RESOURCE_NOT_FOUND',
        correlationId,
        timestamp,
      };
      return reply.status(404).send(errorResponse);
    }
  }

  // 3. Fastify Validation Errors
  if ('validation' in error && error.validation) {
    const errorResponse: ApiErrorResponse = {
      type: 'https://api.amrutam.co.in/errors/validation',
      title: 'ValidationError',
      status: 400,
      detail: error.message,
      instance,
      errorCode: 'REQUEST_VALIDATION_FAILED',
      correlationId,
      timestamp,
      errors: error.validation,
    };
    return reply.status(400).send(errorResponse);
  }

  // 4. Fallback: Unexpected Internal Error (Mask internal details in production)
  logger.error({ error, correlationId, url: request.url }, 'Unhandled unexpected exception caught');

  const errorResponse: ApiErrorResponse = {
    type: 'https://api.amrutam.co.in/errors/internal-server-error',
    title: 'InternalServerError',
    status: 500,
    detail: env.NODE_ENV === 'production'
      ? 'An unexpected error occurred. Please contact support with the correlation ID.'
      : error.message,
    instance,
    errorCode: 'INTERNAL_SERVER_ERROR',
    correlationId,
    timestamp,
  };

  return reply.status(500).send(errorResponse);
}
