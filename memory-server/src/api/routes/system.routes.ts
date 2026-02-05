import { Router } from 'express';
import { SystemController } from '../controllers/system.controller';

export function createSystemRoutes(controller: SystemController): Router {
  const router = Router();

  router.get('/health', controller.health);
  router.get('/status', controller.status);
  router.post('/decay/run', controller.runDecay);

  return router;
}
