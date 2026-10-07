import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
export const problem = (status, message, fields) => Object.assign(new Error(message), { status, fields });
export function callBridge(operation, values = {}, { signal, timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.STUDIO_PYTHON || path.join(root, '.runtime/python/bin/python'), [path.join(root, 'scripts/platform-bridge.py')], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', settled = false;
    const finish = (error, result) => {
      if (settled) return; settled = true; clearTimeout(timeout); signal?.removeEventListener('abort', abort);
      error ? reject(error) : resolve(result);
    };
    const abort = () => { child.kill('SIGTERM'); finish(problem(499, 'The request was cancelled.')); };
    const timeout = setTimeout(() => { child.kill('SIGKILL'); finish(problem(504, 'The model runtime took too long. Try smaller inputs or a different model.')); }, timeoutMs).unref();
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });
    child.on('error', () => finish(problem(503, 'The AI runtime is unavailable. Run npm run runtime:setup, then restart the app.')));
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.length > 8 * 1024 * 1024) { child.kill('SIGKILL'); finish(problem(502, 'The runtime returned too much data. Reduce the input size.')); }
    });
    // SDK stderr can contain provider diagnostics. Do not forward credentials or log payloads.
    child.stderr.on('data', () => {});
    child.stdin.on('error', () => {});
    child.on('close', () => {
      if (settled) return;
      try {
        const response = JSON.parse(output);
        if (!response.ok) {
          let message = String(response.error || 'The runtime could not complete the request.');
          for (const key of ['private_key', 'email', 'password']) if (values[key]) message = message.split(values[key]).join('[redacted]');
          message = message.replace(/(?:0x)?[a-fA-F0-9]{64}/g, '[redacted]').slice(0, 600);
          if (['ImportError', 'ModuleNotFoundError'].includes(response.type)) return finish(problem(503, 'The AI runtime needs its dependencies. Run npm run runtime:setup.'));
          return finish(problem(response.type === 'ValueError' ? 422 : 502, message));
        }
        finish(null, response.result);
      } catch { finish(problem(502, 'The AI runtime returned an unreadable response.')); }
    });
    child.stdin.end(JSON.stringify({ operation, ...values }));
  });
}
