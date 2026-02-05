import { Router } from 'express';
import { createEngramRoutes } from './engram.routes';
import { createChronicleRoutes, createNexusRoutes } from './chronicle.routes';
import { createSystemRoutes } from './system.routes';
import { EngramController } from '../controllers/engram.controller';
import { ChronicleController } from '../controllers/chronicle.controller';
import { SystemController } from '../controllers/system.controller';

export interface RouteControllers {
  engram: EngramController;
  chronicle: ChronicleController;
  system: SystemController;
}

export function mountRoutes(controllers: RouteControllers): Router {
  const router = Router();

  router.use('/engrams', createEngramRoutes(controllers.engram));
  router.use('/chronicles', createChronicleRoutes(controllers.chronicle));
  router.use('/nexuses', createNexusRoutes(controllers.chronicle));

  // System routes mounted at root level
  const systemRoutes = createSystemRoutes(controllers.system);
  router.use('/', systemRoutes);

  return router;
}
