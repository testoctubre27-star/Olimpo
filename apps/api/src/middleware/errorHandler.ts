import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError, ValidationError } from '../utils/errors';
import { respond } from '../utils/response';
import { logger } from '../config/logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): Response {
  // Operational errors (expected)
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error('Operational error', { err, path: req.path });
    }

    const payload: { message: string; code?: string; fields?: Record<string, string> } = {
      message: err.message,
      code: err.code,
    };

    if (err instanceof ValidationError && err.fields) {
      payload.fields = err.fields;
    }

    return respond.error(res, payload, err.statusCode);
  }

  // Zod validation errors
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    err.errors.forEach((e) => {
      const key = e.path.join('.');
      fields[key] = e.message;
    });
    return respond.error(
      res,
      { message: 'Error de validación', code: 'VALIDATION_ERROR', fields },
      422
    );
  }

  // Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return respond.error(
        res,
        { message: 'El registro ya existe (campo único duplicado)', code: 'DUPLICATE' },
        409
      );
    }
    if (err.code === 'P2025') {
      return respond.error(
        res,
        { message: 'Registro no encontrado', code: 'NOT_FOUND' },
        404
      );
    }
  }

  // Unexpected errors — log full stack
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  return respond.error(
    res,
    { message: 'Error interno del servidor', code: 'INTERNAL_ERROR' },
    500
  );
}
