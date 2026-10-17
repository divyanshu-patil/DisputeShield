// Typed application errors. The error-handler plugin maps them to HTTP responses.

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
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

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(404, "NOT_FOUND", message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, "CONFLICT", message);
  }
}

export class NotImplementedError extends AppError {
  constructor(message = "Not implemented yet") {
    super(501, "NOT_IMPLEMENTED", message);
  }
}

export class UpstreamError extends AppError {
  constructor(statusCode: 502 | 504, code: string, message: string) {
    super(statusCode, code, message);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = "Too many requests", public readonly retryAfterSeconds?: number) {
    super(429, "RATE_LIMITED", message);
  }
}
