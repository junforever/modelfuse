import type { Pool } from 'pg';

export const testDbConnection = async (postgresPool: Pool) => {
  try {
    const res = await postgresPool.query('SELECT NOW() AS connected_at');
    console.log('✅ PROVISIONAL: Conexión a la base de datos exitosa:', res.rows[0]);
  } catch (err) {
    console.error('❌ PROVISIONAL: Error conectando a la base de datos:', err);
  }
};
