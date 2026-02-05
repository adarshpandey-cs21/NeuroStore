import { Request, Response, NextFunction } from 'express';
import { TemporalService } from '../../services/temporal.service';
import { createApiError } from '../middleware/error-handler';

export class ChronicleController {
  constructor(private temporalService: TemporalService) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = { ...req.body };
      if (input.effectiveFrom) input.effectiveFrom = new Date(input.effectiveFrom);
      if (input.effectiveUntil) input.effectiveUntil = new Date(input.effectiveUntil);

      const chronicle = await this.temporalService.recordFact(input);
      res.status(201).json({ chronicle });
    } catch (error) {
      next(error);
    }
  };

  query = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = (req as any).validatedQuery || req.query;
      const parsedQuery = {
        ownerId: query.ownerId as string,
        entity: query.entity as string | undefined,
        attribute: query.attribute as string | undefined,
        at: query.at ? new Date(query.at as string) : undefined,
        from: query.from ? new Date(query.from as string) : undefined,
        to: query.to ? new Date(query.to as string) : undefined,
        limit: query.limit ? Number(query.limit) : undefined,
        offset: query.offset ? Number(query.offset) : undefined,
      };
      const result = await this.temporalService.queryFacts(parsedQuery);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  getCurrent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { ownerId, entity, attribute } = req.query;
      if (!ownerId || !entity || !attribute) {
        return next(createApiError(400, 'ownerId, entity, and attribute are required'));
      }
      const chronicle = await this.temporalService.getCurrentFact(
        ownerId as string,
        entity as string,
        attribute as string
      );
      if (!chronicle) {
        return next(createApiError(404, 'No current fact found'));
      }
      res.json({ chronicle });
    } catch (error) {
      next(error);
    }
  };

  getTimeline = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { ownerId, entity } = req.query;
      if (!ownerId || !entity) {
        return next(createApiError(400, 'ownerId and entity are required'));
      }
      const chronicles = await this.temporalService.getTimeline(
        ownerId as string,
        entity as string
      );
      res.json({ chronicles });
    } catch (error) {
      next(error);
    }
  };

  get = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const chronicle = await this.temporalService.getChronicle(req.params.id);
      if (!chronicle) {
        return next(createApiError(404, 'Chronicle not found'));
      }
      res.json({ chronicle });
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = { ...req.body };
      if (input.effectiveUntil) input.effectiveUntil = new Date(input.effectiveUntil);

      const chronicle = await this.temporalService.updateChronicle(req.params.id, input);
      if (!chronicle) {
        return next(createApiError(404, 'Chronicle not found'));
      }
      res.json({ chronicle });
    } catch (error) {
      next(error);
    }
  };

  expire = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const expired = await this.temporalService.expireChronicle(req.params.id);
      if (!expired) {
        return next(createApiError(404, 'Chronicle not found or already expired'));
      }
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  createNexus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = { ...req.body };
      if (input.effectiveFrom) input.effectiveFrom = new Date(input.effectiveFrom);
      if (input.effectiveUntil) input.effectiveUntil = new Date(input.effectiveUntil);

      const nexus = await this.temporalService.linkChronicles(input);
      res.status(201).json({ nexus });
    } catch (error) {
      next(error);
    }
  };

  getRelated = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const related = await this.temporalService.getRelated(req.params.id);
      res.json({ related });
    } catch (error) {
      next(error);
    }
  };
}
