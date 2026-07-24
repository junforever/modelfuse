import { postgresPool } from '#infrastructure/postgres/postgresPool';

export const testDbConnection = async () => {
  try {
    const res = await postgresPool.query('SELECT NOW() AS connected_at');
    console.log('✅ PROVISIONAL: Conexión a la base de datos exitosa:', res.rows[0]);
  } catch (err) {
    console.error('❌ PROVISIONAL: Error conectando a la base de datos:', err);
  }
};
