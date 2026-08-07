import type { Pool, PoolClient } from 'pg';

export async function withTransaction<Result>(
  pool: Pool,
  work: (client: PoolClient) => Promise<Result>,
): Promise<Result> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
