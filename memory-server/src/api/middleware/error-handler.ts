import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger';

export interface ApiError {
  status: number;
  message: string;
  details?: unknown;
}

export function errorHandler(err: Error | ApiError, _req: Request, res: Response, _next: NextFunction): void {
  const status = 'status' in err ? err.status : 500;
  const message = err.message || 'Internal server error';
  const details = 'details' in err ? err.details : undefined;

  if (status >= 500) {
    logger.error('Server error', { message, stack: err instanceof Error ? err.stack : undefined });
  } else {
    logger.warn('Client error', { status, message });
  }

  res.status(status).json({
    error: {
      status,
      message,
      ...(details ? { details } : {}),
    },
  });
}

export function createApiError(status: number, message: string, details?: unknown): ApiError {
  return { status, message, details };
}

export function notFound(_req: Request, _res: Response, next: NextFunction): void {
  next(createApiError(404, 'Not found'));
}
