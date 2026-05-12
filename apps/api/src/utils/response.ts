import { Response } from 'express';

interface SuccessPayload<T> {
  data: T;
  message?: string;
  meta?: Record<string, unknown>;
}

interface ErrorPayload {
  message: string;
  code?: string;
  fields?: Record<string, string>;
}

export const respond = {
  ok<T>(res: Response, payload: SuccessPayload<T>, statusCode = 200): Response {
    return res.status(statusCode).json({
      success: true,
      ...payload,
    });
  },

  created<T>(res: Response, payload: SuccessPayload<T>): Response {
    return respond.ok(res, payload, 201);
  },

  noContent(res: Response): Response {
    return res.status(204).send();
  },

  error(res: Response, payload: ErrorPayload, statusCode = 500): Response {
    return res.status(statusCode).json({
      success: false,
      ...payload,
    });
  },
};
