import { createServer } from 'node:http';

export function parsePort(value = 4310, label = 'PORT') {
  const port = Number(value);
  if (String(value).trim() === '' || !Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`${label} must be a whole number between 0 and 65535.`);
  }
  return port;
}

// Bind each candidate directly so another process cannot claim a probed port.
export async function listenWithFallback(handler, { host = '127.0.0.1', port = 4310, strictPort = false, attempts = 20 } = {}) {
  port = parsePort(port);
  if (!Number.isInteger(attempts) || attempts < 1) throw new Error('Port attempts must be a positive integer.');
  const lastPort = strictPort || port === 0 ? port : Math.min(65535, port + attempts - 1);
  for (let candidate = port; candidate <= lastPort; candidate++) {
    const server = createServer(handler);
    try {
      await new Promise((resolve, reject) => {
        const failed = error => { server.off('listening', ready); reject(error); };
        const ready = () => { server.off('error', failed); resolve(); };
        server.once('error', failed);
        server.once('listening', ready);
        server.listen(candidate, host);
      });
      return server;
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
      if (candidate === lastPort) {
        throw new Error(strictPort
          ? `Port ${port} is in use. Unset STRICT_PORT to select an available port automatically.`
          : `No available port between ${port} and ${lastPort}. Set PORT to another port and try again.`, { cause: error });
      }
    }
  }
}

export function localUrl(host, port) {
  const browserHost = host === '0.0.0.0' ? '127.0.0.1' : host === '::' ? '::1' : host;
  return `http://${browserHost.includes(':') ? `[${browserHost}]` : browserHost}:${port}`;
}
