import app from './app.mjs';
import { pool } from './db.mjs';
import { listenWithFallback, localUrl, parsePort } from './listen.mjs';
import { platform } from './platform.mjs';
const workflowStops = new WeakMap();

export async function startStudio() {
  const port = parsePort(process.env.PORT || 4310);
  const host = process.env.HOST || '127.0.0.1';
  try {
    await pool.query('SELECT 1 FROM schema_migrations WHERE version=1');
  } catch (error) {
    throw new Error(`Cannot connect to the application database: ${error.message}. Run ./start.sh to initialize it.`, { cause: error });
  }
  const server = await listenWithFallback(app, { port, host, strictPort: process.env.STRICT_PORT === '1' });
  const actualPort = server.address().port;
  const stopWorkflows = platform.workflows.start();
  workflowStops.set(server, stopWorkflows);
  server.once('close', stopWorkflows);
  if (port && actualPort !== port) console.log(`Port ${port} is in use. Using available port ${actualPort}.`);
  console.log(`\n  OpenGradient Studio\n  Local: ${localUrl(host, actualPort)}\n  Database: PostgreSQL · persistent storage\n  Mode: Model hosting · AI inference · Workflows\n`);
  return { server, host, port: actualPort };
}

export function installShutdown(server, closeExtra = async () => {}) {
  let closing = false;
  const stop = async () => {
    if (closing) return;
    closing = true;
    console.log('\nStopping OpenGradient Studio…');
    const timeout = setTimeout(() => process.exit(1), 5000).unref();
    try {
      await workflowStops.get(server)?.();
      await Promise.all([
        new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
        closeExtra(),
      ]);
      await pool.end();
      clearTimeout(timeout);
      process.exit(0);
    } catch (error) {
      console.error(`Shutdown failed: ${error.message}`);
      process.exit(1);
    }
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
