import { Request, Response, NextFunction } from 'express';
import { createApiError } from './error-handler';
import { logger } from '../../utils/logger';

const NS_API_KEY = process.env.NS_API_KEY;

export function authGuard(req: Request, _res: Response, next: NextFunction): void {
  if (!NS_API_KEY) {
    // No key configured — auth disabled
    return next();
  }

  const header = req.headers['x-api-key'] as string | undefined;
  const bearer = req.headers.authorization;

  const provided = header || (bearer?.startsWith('Bearer ') ? bearer.slice(7) : undefined);

  if (!provided) {
    logger.warn('Missing API key', { path: req.path });
    return next(createApiError(401, 'Missing API key. Provide via X-API-Key header or Authorization: Bearer <key>'));
  }

  if (provided !== NS_API_KEY) {
    logger.warn('Invalid API key', { path: req.path });
    return next(createApiError(403, 'Invalid API key'));
  }

  next();
}
