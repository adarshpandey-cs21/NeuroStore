import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { createApiError } from './error-handler';

export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const data = source === 'body' ? req.body : source === 'query' ? req.query : req.params;
      const parsed = schema.parse(data);

      if (source === 'body') {
        req.body = parsed;
      } else if (source === 'query') {
        (req as any).validatedQuery = parsed;
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map(e => ({
          path: e.path.join('.'),
          message: e.message,
        }));
        next(createApiError(400, 'Validation failed', details));
      } else {
        next(error);
      }
    }
  };
}
