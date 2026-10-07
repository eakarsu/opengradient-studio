import { createServer } from 'vite';
import { startStudio, installShutdown } from '../server/runtime.mjs';
import { pool } from '../server/db.mjs';
import { localUrl, parsePort } from '../server/listen.mjs';

let server, vite;
try {
  const devPort = parsePort(process.env.DEV_PORT || 5173, 'DEV_PORT');
  const studio = await startStudio();
  server = studio.server;
  vite = await createServer({
    // This ESM config needs no bundling; temporary bundled configs trigger Node's watcher.
    configLoader: 'native',
    server: {
      host: studio.host,
      port: devPort,
      strictPort: process.env.STRICT_PORT === '1',
      // Preserve the browser-facing Host so same-origin writes pass the API check.
      proxy: { '/api': { target: localUrl(studio.host, studio.port), changeOrigin: false } },
    },
  });
  await vite.listen();
  console.log('  Development frontend (hot reload):');
  vite.printUrls();
  installShutdown(server, () => vite.close());
} catch (error) {
  console.error(`Cannot start development server: ${error.message}`);
  if (vite) await vite.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await pool.end();
  process.exitCode = 1;
}
