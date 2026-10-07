import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, '.runtime/python');
const python = path.join(directory, 'bin/python');
const lockfile = path.join(root, 'requirements-python.lock');
const hash = createHash('sha256').update(await readFile(lockfile)).digest('hex');
const stamp = path.join(root, '.runtime/python-dependencies');
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`Could not prepare the AI runtime using ${command}. Install Python 3.12 and run npm run runtime:setup.`);
};
try {
  await mkdir(path.join(root, '.runtime'), { recursive: true });
  let exists = false;
  try { await access(python); exists = true; } catch {}
  const uv = spawnSync('uv', ['--version'], { stdio: 'ignore' }).status === 0;
  if (!exists) {
    const candidates = ['python3.12', 'python3.11', 'python3.13', 'python3'];
    const available = candidates.find(command => spawnSync(command, ['-c', 'import sys;sys.exit(0 if (3,11)<=sys.version_info[:2]<=(3,13) else 1)'], { stdio: 'ignore' }).status === 0);
    if (available) run(available, ['-m', 'venv', directory]);
    else if (uv) run('uv', ['venv', '--python', '3.12', directory]);
    else throw new Error('Install Python 3.12, then run npm run runtime:setup.');
  }
  let saved; try { saved = await readFile(stamp, 'utf8'); } catch {}
  if (saved !== hash) {
    console.log('Installing the locked OpenGradient SDK and ONNX Runtime…');
    if (uv) run('uv', ['pip', 'install', '--python', python, '--index-url', 'https://pypi.org/simple', '--prerelease=allow', '-r', lockfile]);
    else run(python, ['-m', 'pip', 'install', '--index-url', 'https://pypi.org/simple', '-r', lockfile]);
    run(python, ['-c', 'import opengradient, onnxruntime, onnx']);
    await writeFile(stamp, hash);
  }
  console.log('AI runtime ready: OpenGradient SDK and ONNX Runtime.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
