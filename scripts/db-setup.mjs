import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { dbConfig, pool, transaction } from '../server/db.mjs';
import { seed } from '../server/seed.mjs';
import { entityOrder } from '../shared/entities.mjs';

try {
  const config = dbConfig();
  const database = config.connectionString ? decodeURIComponent(new URL(config.connectionString).pathname.slice(1)) : config.database;
  if (!database || !/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(database)) throw new Error('Use a database name containing letters, numbers, and underscores.');
  const probe = new pg.Client(config);
  try {
    await probe.connect();
    await probe.query('SELECT 1');
  } catch (error) {
    if (error.code !== '3D000') throw error;
    const admin = new pg.Client(dbConfig('postgres'));
    try {
      await admin.connect();
      const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [database]);
      if (!exists.rowCount) {
        await admin.query(`CREATE DATABASE "${database}"`);
        console.log(`Created PostgreSQL database: ${database}`);
      }
    } finally { await admin.end(); }
  } finally { await probe.end(); }
  const sql = await readFile(new URL('../server/schema.sql', import.meta.url), 'utf8');
  await transaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(742913561)');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations(version) VALUES(1) ON CONFLICT DO NOTHING');
    console.log(await seed(client) ? 'Seeded all eight modules. Existing data will be preserved on future starts.' : 'Database ready. Existing records preserved.');
  });
  for (const entity of entityOrder) {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS count FROM "${entity}"`);
    console.log(`  ${entity}: ${rows[0].count} records`);
  }
} catch (error) {
  console.error(`Database setup failed: ${error.message}`);
  console.error('Start PostgreSQL, set DATABASE_URL in .env, or run USE_DOCKER=1 ./start.sh.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
