import { Request, Response, NextFunction } from 'express';
import { MemoryService } from '../../services/memory.service';
import { Engram } from '../../types/engram.types';
import { createApiError } from '../middleware/error-handler';

/** Strip embedding vector from API responses — it's internal data, not useful to clients. */
function withoutEmbedding(engram: Engram): Omit<Engram, 'embedding'> {
  const { embedding, ...rest } = engram;
  return rest;
}

export class EngramController {
  constructor(private memoryService: MemoryService) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const engrams = await this.memoryService.addMemory(req.body);
      res.status(201).json({ engrams: engrams.map(withoutEmbedding) });
    } catch (error) {
      next(error);
    }
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { ownerId, limit, offset, strand } = (req as any).validatedQuery || req.query;
      const result = await this.memoryService.listEngrams(
        ownerId as string,
        {
          limit: limit ? Number(limit) : undefined,
          offset: offset ? Number(offset) : undefined,
          strand: strand as any,
        }
      );
      res.json({ ...result, engrams: result.engrams.map(withoutEmbedding) });
    } catch (error) {
      next(error);
    }
  };

  get = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const engram = await this.memoryService.getEngram(req.params.id);
      if (!engram) {
        return next(createApiError(404, 'Engram not found'));
      }
      res.json({ engram: withoutEmbedding(engram) });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const engram = await this.memoryService.updateEngram(req.params.id, req.body);
      if (!engram) {
        return next(createApiError(404, 'Engram not found'));
      }
      res.json({ engram: withoutEmbedding(engram) });
    } catch (error) {
      next(error);
    }
  };

  delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const deleted = await this.memoryService.deleteEngram(req.params.id);
      if (!deleted) {
        return next(createApiError(404, 'Engram not found'));
      }
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  search = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.memoryService.search(req.body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  reinforce = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const boost = req.body.boost ?? 0.1;
      const engram = await this.memoryService.reinforceEngram(req.params.id, boost);
      if (!engram) {
        return next(createApiError(404, 'Engram not found'));
      }
      res.json({ engram: withoutEmbedding(engram) });
    } catch (error) {
      next(error);
    }
  };
}
