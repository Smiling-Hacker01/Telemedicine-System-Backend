export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly details?: unknown;
  public readonly isOperational: boolean;

  constructor(
    statusCode: number,
    errorCode: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, "VALIDATION_ERROR", message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(401, "UNAUTHORIZED", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Access forbidden: Insufficient permissions") {
    super(403, "FORBIDDEN", message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    const msg = identifier
      ? `${resource} with identifier '${identifier}' was not found`
      : `${resource} not found`;
    super(404, "NOT_FOUND", msg);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(409, "CONFLICT", message, details);
  }
}

export class ConcurrencyConflictError extends AppError {
  constructor(
    message = "The requested slot or resource was modified by another concurrent transaction. Please retry.",
  ) {
    super(409, "CONCURRENCY_CONFLICT", message);
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(message: string, details?: unknown) {
    super(422, "UNPROCESSABLE_ENTITY", message, details);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = "Rate limit exceeded. Please try again later.") {
    super(429, "TOO_MANY_REQUESTS", message);
  }
}

export class InternalServerError extends AppError {
  constructor(message = "An unexpected internal error occurred") {
    super(500, "INTERNAL_SERVER_ERROR", message);
  }
}
