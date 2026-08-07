import { Pool } from 'pg';

const REQUIRED_TABLES = ['conversations', 'turns', 'model_responses'] as const;

export function createIntegrationPool(): Pool {
  const value = process.env.MODELFUSE_TEST_DATABASE_URL;
  if (!value) {
    throw new Error('MODELFUSE_TEST_DATABASE_URL is required for PostgreSQL integration tests');
  }

  const url = new URL(value);
  const database = url.pathname.slice(1);
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname) || !database.includes('test')) {
    throw new Error('Integration database must be loopback and its name must contain "test"');
  }

  return new Pool({ connectionString: value, max: 8 });
}

export async function assertModelFuseSchema(pool: Pool): Promise<void> {
  const result = await pool.query<{ name: string | null }>(
    `SELECT to_regclass('public.' || name)::text AS name
       FROM unnest($1::text[]) AS name`,
    [REQUIRED_TABLES]
  );

  if (result.rows.some(({ name }) => name === null)) {
    throw new Error('Integration database must have the ModelFuse Liquibase schema applied');
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
