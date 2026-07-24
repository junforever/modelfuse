import { Pool } from 'pg';
import { logger } from '../../utils/logger.js';

const { POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB } = process.env;

if (!POSTGRES_USER || !POSTGRES_PASSWORD || !POSTGRES_DB) {
  throw new Error('POSTGRES_USER, POSTGRES_PASSWORD, and POSTGRES_DB are required in .env');
}

const connectionString = `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}?schema=public`;

export const postgresPool = new Pool({
  connectionString,
  max: Number(process.env.POSTGRES_MAX_CONNECTIONS || 10),
  idleTimeoutMillis: Number(process.env.POSTGRES_IDLE_TIMEOUT || 30000),
  connectionTimeoutMillis: Number(process.env.POSTGRES_CONNECTION_TIMEOUT || 2000),
  keepAlive: process.env.POSTGRES_KEEP_ALIVE === 'true',
});

postgresPool.on('error', error =>
  logger.error({
    message: 'Postgres pool error',
    operation: 'postgres_pool',
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name,
    },
    connectionString: process.env.POSTGRES_CONNECTION_STRING,
  })
);

postgresPool.on('connect', () =>
  logger.info({
    message: 'Successfully connected to Postgres',
    operation: 'postgres_pool_connect',
    connectionString: process.env.POSTGRES_CONNECTION_STRING,
  })
);

postgresPool.on('remove', () =>
  logger.info({
    message: 'Postgres pool client removed',
    operation: 'postgres_pool_remove',
    connectionString: process.env.POSTGRES_CONNECTION_STRING,
  })
);
