import type { Pool, PoolClient } from 'pg';

export async function withTransaction<Result>(
  pool: Pool,
  work: (client: PoolClient) => Promise<Result>,
  options?: { isolationLevel: 'REPEATABLE READ'; readOnly: true },
): Promise<Result> {
  const client = await pool.connect();

  try {
    await client.query(
      options
        ? `BEGIN ISOLATION LEVEL ${options.isolationLevel} READ ONLY`
        : 'BEGIN',
    );
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
