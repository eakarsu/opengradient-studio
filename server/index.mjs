import { startStudio, installShutdown } from './runtime.mjs';
import { pool } from './db.mjs';

try {
  const { server } = await startStudio();
  installShutdown(server);
} catch (error) {
  console.error(`Cannot start: ${error.message}`);
  await pool.end(); process.exitCode = 1;
}
