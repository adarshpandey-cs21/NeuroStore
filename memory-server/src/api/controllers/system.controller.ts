import { Request, Response, NextFunction } from 'express';
import { MemoryService } from '../../services/memory.service';
import { DecayService } from '../../services/decay.service';

export class SystemController {
  constructor(
    private memoryService: MemoryService,
    private decayService: DecayService
  ) {}

  health = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dbHealth = await this.memoryService.healthCheck();
      res.json({
        status: dbHealth.ok ? 'ok' : 'degraded',
        database: dbHealth.type,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  status = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const stats = await this.memoryService.getStats();
      const dbHealth = await this.memoryService.healthCheck();
      res.json({
        database: dbHealth.type,
        stats,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      });
    } catch (error) {
      next(error);
    }
  };

  runDecay = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { ownerId } = req.body;
      if (!ownerId) {
        res.status(400).json({ error: { status: 400, message: 'ownerId is required' } });
        return;
      }
      const result = await this.decayService.runDecay(ownerId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };
}
