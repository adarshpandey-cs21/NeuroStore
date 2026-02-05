import { Router } from 'express';
import { EngramController } from '../controllers/engram.controller';
import { validate } from '../middleware/validate';
import { CreateEngramSchema, SearchEngramSchema, UpdateEngramSchema, ListEngramsSchema, ReinforceEngramSchema } from '../../schemas/engram.schema';

export function createEngramRoutes(controller: EngramController): Router {
  const router = Router();

  router.post('/', validate(CreateEngramSchema), controller.create);
  router.get('/', validate(ListEngramsSchema, 'query'), controller.list);
  router.get('/:id', controller.get);
  router.patch('/:id', validate(UpdateEngramSchema), controller.update);
  router.delete('/:id', controller.delete);
  router.post('/search', validate(SearchEngramSchema), controller.search);
  router.post('/:id/reinforce', validate(ReinforceEngramSchema), controller.reinforce);

  return router;
}
