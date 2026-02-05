import { Router } from 'express';
import { ChronicleController } from '../controllers/chronicle.controller';
import { validate } from '../middleware/validate';
import { CreateChronicleSchema, UpdateChronicleSchema, QueryChronicleSchema, CreateNexusSchema } from '../../schemas/chronicle.schema';

export function createChronicleRoutes(controller: ChronicleController): Router {
  const router = Router();

  router.post('/', validate(CreateChronicleSchema), controller.create);
  router.get('/', validate(QueryChronicleSchema, 'query'), controller.query);
  router.get('/current', controller.getCurrent);
  router.get('/timeline', controller.getTimeline);
  router.get('/:id', controller.get);
  router.patch('/:id', validate(UpdateChronicleSchema), controller.update);
  router.delete('/:id', controller.expire);
  router.get('/:id/related', controller.getRelated);

  return router;
}

export function createNexusRoutes(controller: ChronicleController): Router {
  const router = Router();
  router.post('/', validate(CreateNexusSchema), controller.createNexus);
  return router;
}
