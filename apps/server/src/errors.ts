import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message, 400);
  }
}
export class AuthError extends AppError {
  constructor(message: string = "unauthorized") {
    super("AUTH_ERROR", message, 401);
  }
}
export class ForbiddenError extends AppError {
  constructor(message: string = "forbidden") {
    super("FORBIDDEN", message, 403);
  }
}
export class NotFoundError extends AppError {
  constructor(message: string = "not found") {
    super("NOT_FOUND", message, 404);
  }
}
export class ConflictError extends AppError {
  constructor(message: string) {
    super("CONFLICT", message, 409);
  }
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof AppError) {
      reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message },
      });
      return;
    }
    // Fastify's built-in validation errors
    if (error.validation) {
      reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: error.message },
      });
      return;
    }
    // Anything else: log but don't leak
    request.log.error({ err: error }, "unhandled error");
    reply.status(500).send({
      error: { code: "INTERNAL_ERROR", message: "internal server error" },
    });
  });
}
