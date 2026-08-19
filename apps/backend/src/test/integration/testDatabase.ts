import { Pool } from 'pg';

const REQUIRED_TABLES = ['conversations', 'turns', 'model_responses'] as const;
const ISOLATED_SCHEMA_PREFIX = 'modelfuse_it';

type IntegrationPool = Pool & { integrationSchema?: string };

export interface IntegrationPoolOptions {
  /** Create a private schema for the suite while retaining the migrated public schema as source. */
  schema?: string;
}

export function createIntegrationPool(options: IntegrationPoolOptions = {}): Pool {
  const value = process.env.MODELFUSE_TEST_DATABASE_URL;
  if (!value) {
    throw new Error('MODELFUSE_TEST_DATABASE_URL is required for PostgreSQL integration tests');
  }

  const url = new URL(value);
  const database = url.pathname.slice(1);
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname) || !database.includes('test')) {
    throw new Error('Integration database must be loopback and its name must contain "test"');
  }

  const integrationSchema = options.schema
    ? `${ISOLATED_SCHEMA_PREFIX}_${options.schema}_${process.pid}_${Math.random().toString(36).slice(2, 10)}`
    : undefined;
  const pool = new Pool({
    connectionString: value,
    max: 8,
    ...(integrationSchema ? { options: `-c search_path=${quoteIdentifier(integrationSchema)},public` } : {}),
  }) as IntegrationPool;
  pool.integrationSchema = integrationSchema;
  return pool;
}

export async function assertModelFuseSchema(pool: Pool): Promise<void> {
  const integrationSchema = (pool as IntegrationPool).integrationSchema;
  if (integrationSchema) await createIsolatedSchema(pool, integrationSchema);

  const result = await pool.query<{ name: string | null }>(
    `SELECT to_regclass($2 || '.' || name)::text AS name
       FROM unnest($1::text[]) AS name`,
    [REQUIRED_TABLES, integrationSchema ?? 'public']
  );

  if (result.rows.some(({ name }) => name === null)) {
    throw new Error('Integration database must have the ModelFuse Liquibase schema applied');
  }
}

export async function dropIntegrationSchema(pool: Pool | undefined): Promise<void> {
  if (!pool) return;
  const integrationSchema = (pool as IntegrationPool).integrationSchema;
  if (integrationSchema) {
    await pool.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(integrationSchema)} CASCADE`);
  }
}

export async function deleteOwnedConversations(pool: Pool, ids: readonly string[]): Promise<void> {
  if (ids.length > 0) {
    await pool.query('DELETE FROM conversations WHERE id = ANY($1::uuid[])', [ids]);
  }
}

export async function deleteOwnedConversationRequests(
  pool: Pool,
  clientRequestIds: readonly string[]
): Promise<void> {
  if (clientRequestIds.length > 0) {
    await pool.query('DELETE FROM conversations WHERE create_client_request_id = ANY($1::uuid[])', [
      clientRequestIds,
    ]);
  }
}

async function createIsolatedSchema(pool: Pool, schema: string): Promise<void> {
  const identifier = quoteIdentifier(schema);
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${identifier}`);

  for (const table of REQUIRED_TABLES) {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS ${identifier}.${quoteIdentifier(table)}
         (LIKE public.${quoteIdentifier(table)} INCLUDING ALL)`
    );
  }

  await pool.query(`
    DO $block$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = ${quoteLiteral(`${schema}.turns`)}::regclass
           AND conname = 'fk_turns_conversation'
      ) THEN
        ALTER TABLE ${identifier}.turns
          ADD CONSTRAINT fk_turns_conversation
          FOREIGN KEY (conversation_id) REFERENCES ${identifier}.conversations (id) ON DELETE CASCADE;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = ${quoteLiteral(`${schema}.model_responses`)}::regclass
           AND conname = 'fk_model_responses_turn'
      ) THEN
        ALTER TABLE ${identifier}.model_responses
          ADD CONSTRAINT fk_model_responses_turn
          FOREIGN KEY (turn_id) REFERENCES ${identifier}.turns (id) ON DELETE CASCADE;
      END IF;
    END
    $block$`);
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
