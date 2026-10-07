import 'dotenv/config';
import pg from 'pg';
import os from 'node:os';

pg.types.setTypeParser(1700, Number);
pg.types.setTypeParser(20, Number);

export function dbConfig(database) {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    if (database) url.pathname = `/${database}`;
    return { connectionString: url.toString(), connectionTimeoutMillis: 5000 };
  }
  return {
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || os.userInfo().username,
    password: process.env.PGPASSWORD,
    database: database || process.env.PGDATABASE || 'opengradient_studio',
    connectionTimeoutMillis: 5000,
  };
}

export const pool = new pg.Pool({ ...dbConfig(), max: 10, idleTimeoutMillis: 30000 });
pool.on('error', error => console.error('PostgreSQL connection error:', error.message));

export async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
