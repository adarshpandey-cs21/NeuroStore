import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { createDataStore } from './db';
import { ProviderFactory } from './providers';
import { MemoryService } from './services/memory.service';
import { TemporalService } from './services/temporal.service';
import { DecayService } from './services/decay.service';
import { EngramController } from './api/controllers/engram.controller';
import { ChronicleController } from './api/controllers/chronicle.controller';
import { SystemController } from './api/controllers/system.controller';
import { mountRoutes } from './api/routes';
import { errorHandler, notFound } from './api/middleware/error-handler';
import { authGuard } from './api/middleware/auth';
import { logger } from './utils/logger';

async function bootstrap(): Promise<void> {
  const port = parseInt(process.env.NS_PORT || '3000', 10);
  const host = process.env.NS_HOST || '0.0.0.0';

  // 1. Initialize database
  logger.info('Initializing database...');
  const store = await createDataStore();

  // 2. Create providers
  logger.info('Creating AI providers...');
  const { embedder, completion } = ProviderFactory.createFromEnv();

  // 3. Wire services
  const memoryService = new MemoryService(store, embedder, completion);
  const temporalService = new TemporalService(store);
  const decayService = new DecayService(store);

  // 4. Create controllers
  const engramController = new EngramController(memoryService);
  const chronicleController = new ChronicleController(temporalService);
  const systemController = new SystemController(memoryService, decayService);

  // 5. Build Express app
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // API key auth
  app.use('/api', authGuard);

  // Mount API routes
  app.use('/api', mountRoutes({
    engram: engramController,
    chronicle: chronicleController,
    system: systemController,
  }));

  // Error handling
  app.use(notFound);
  app.use(errorHandler);

  // 6. Start server
  app.listen(port, host, () => {
    logger.info(`NeuroStore server running on ${host}:${port}`);
  });
}

bootstrap().catch(err => {
  logger.error('Failed to start server', { error: String(err) });
  process.exit(1);
});
