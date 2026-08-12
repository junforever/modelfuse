import { Pool } from 'pg';
import type { Environment } from '../config/env.js';
import { logger } from '../../utils/logger.js';

export function createPostgresPool(environment: Environment): Pool {
  const pool = new Pool({
    user: environment.POSTGRES_USER,
    password: environment.POSTGRES_PASSWORD,
    database: environment.POSTGRES_DB,
    max: environment.POSTGRES_MAX_CONNECTIONS,
    idleTimeoutMillis: environment.POSTGRES_IDLE_TIMEOUT,
    connectionTimeoutMillis: environment.POSTGRES_CONNECTION_TIMEOUT,
    keepAlive: environment.POSTGRES_KEEP_ALIVE,
  });

  pool.on('error', error =>
    logger.error({
      message: 'Postgres pool error',
      operation: 'postgres_pool',
      errorType: error.name,
    })
  );
  pool.on('connect', () =>
    logger.info({
      message: 'Successfully connected to Postgres',
      operation: 'postgres_pool_connect',
    })
  );
  pool.on('remove', () =>
    logger.info({
      message: 'Postgres pool client removed',
      operation: 'postgres_pool_remove',
    })
  );

  return pool;
}
