import { DataStore } from '../types/db.types';
import { DatabaseConfig } from '../types/config.types';
import { PostgresStore } from './postgres.store';
import { SqliteStore } from './sqlite.store';
import { logger } from '../utils/logger';
import path from 'path';
import fs from 'fs';

export function resolveDatabaseConfig(): DatabaseConfig {
  const pgHost = process.env.NS_PG_HOST;
  const databaseUrl = process.env.NS_DATABASE_URL;

  if (pgHost || databaseUrl) {
    if (databaseUrl) {
      const url = new URL(databaseUrl);
      return {
        type: 'postgres',
        postgres: {
          host: url.hostname,
          port: parseInt(url.port || '5432', 10),
          database: url.pathname.slice(1),
          user: url.username,
          password: url.password,
          ssl: url.searchParams.get('sslmode') !== 'disable',
        },
      };
    }

    return {
      type: 'postgres',
      postgres: {
        host: pgHost!,
        port: parseInt(process.env.NS_PG_PORT || '5432', 10),
        database: process.env.NS_PG_DATABASE || 'neurostore',
        user: process.env.NS_PG_USER || 'postgres',
        password: process.env.NS_PG_PASSWORD || '',
        ssl: process.env.NS_PG_SSL === 'true',
      },
    };
  }

  const sqlitePath = process.env.NS_SQLITE_PATH || path.join(process.cwd(), 'data', 'neurostore.sqlite');
  return { type: 'sqlite', sqlite: { path: sqlitePath } };
}

export async function createDataStore(config?: DatabaseConfig): Promise<DataStore> {
  const dbConfig = config || resolveDatabaseConfig();

  if (dbConfig.type === 'postgres' && dbConfig.postgres) {
    logger.info('Using PostgreSQL database', { host: dbConfig.postgres.host });
    const store = new PostgresStore({
      host: dbConfig.postgres.host,
      port: dbConfig.postgres.port,
      database: dbConfig.postgres.database,
      user: dbConfig.postgres.user,
      password: dbConfig.postgres.password,
      ssl: dbConfig.postgres.ssl ? { rejectUnauthorized: false } : false,
    });
    await store.initialize();
    return store;
  }

  const sqlitePath = dbConfig.sqlite?.path || path.join(process.cwd(), 'data', 'neurostore.sqlite');
  const dir = path.dirname(sqlitePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  logger.info('Using SQLite database', { path: sqlitePath });
  const store = new SqliteStore(sqlitePath);
  await store.initialize();
  return store;
}
