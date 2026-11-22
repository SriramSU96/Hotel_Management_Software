import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { logger } from '../logger.js';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const first = r.error.issues[0];
    throw new HttpError(400, `${first.path.join('.') || 'input'}: ${first.message}`, 'VALIDATION');
  }
  return r.data;
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION' });
  }
  const e = err as { code?: number | string; message?: string; type?: string; name?: string };
  if (e?.name === 'CastError' || e?.name === 'ValidationError') return res.status(400).json({ error: 'Invalid request.', code: 'VALIDATION' });
  if (e?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed request.', code: 'VALIDATION' });
  if (e?.name === 'MulterError') return res.status(e.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: e.code === 'LIMIT_FILE_SIZE' ? 'That photo is too large (max 6 MB).' : 'Could not read the upload.' });
  if (e?.code === 11000) {
    return res.status(409).json({ error: 'This record already exists.', code: 'DUPLICATE' });
  }
  if (e?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request is too large.' });
  }
  logger.error({ err, path: req.path }, 'Unhandled error');
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
}
