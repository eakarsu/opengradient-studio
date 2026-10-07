import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { callBridge, problem } from './bridge.mjs';
import { createSettingsStore } from './ai.mjs';

export function createConnectionStore({ filename = fileURLToPath(new URL('../.runtime/platform.json', import.meta.url)), environment = process.env, bridge = callBridge } = {}) {
  async function read() {
    let saved = {};
    try { saved = JSON.parse(await readFile(filename, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw problem(500, 'Connection settings could not be read.'); }
    return {
      email: saved.email || environment.OG_HUB_EMAIL || '', password: saved.password || environment.OG_HUB_PASSWORD || '',
      private_key: saved.private_key || environment.OG_PRIVATE_KEY || '', address: saved.address || '',
      payments_enabled: saved.payments_enabled ?? environment.OG_ALLOW_PAYMENTS === '1',
    };
  }
  async function save(input) {
    const current = await read();
    const saved = { ...current };
    if (input.email !== undefined) {
      if (typeof input.email !== 'string' || input.email.length > 254 || !/^\S+@\S+\.\S+$/.test(input.email)) throw problem(422, 'Enter your Model Hub account email.');
      saved.email = input.email.trim();
    }
    if (input.password) {
      if (typeof input.password !== 'string' || input.password.length > 512) throw problem(422, 'Enter a valid Model Hub password.');
      saved.password = input.password;
    }
    if (input.private_key) {
      if (typeof input.private_key !== 'string' || !/^(0x)?[a-fA-F0-9]{64}$/.test(input.private_key.trim())) throw problem(422, 'Enter a valid EVM private key.');
      saved.private_key = input.private_key.trim();
      saved.address = (await bridge('wallet_address', { private_key: saved.private_key })).address;
    }
    if (input.payments_enabled !== undefined) {
      if (typeof input.payments_enabled !== 'boolean') throw problem(422, 'Choose whether OpenGradient payments are enabled.');
      saved.payments_enabled = input.payments_enabled;
    }
    if (input.email !== undefined || input.password) {
      if (!saved.email || !saved.password) throw problem(422, 'Provide both your Model Hub email and password.');
      await bridge('hub_check', { email: saved.email, password: saved.password });
    }
    await mkdir(path.dirname(filename), { recursive: true });
    const temporary = `${filename}.${randomUUID()}.tmp`;
    try { await writeFile(temporary, JSON.stringify(saved), { flag: 'wx', mode: 0o600 }); await rename(temporary, filename); }
    finally { await unlink(temporary).catch(() => {}); }
    return read();
  }
  return { read, save };
}

export async function publicConnections(store, openRouter = createSettingsStore(), bridge = callBridge) {
  const [settings, router] = await Promise.all([store.read(), openRouter.read()]);
  let runtime, runtime_error = '';
  try { runtime = await bridge('sdk_status', {}, { timeoutMs: 20000 }); }
  catch (error) { runtime_error = error.message; }
  let address = settings.address;
  if (!address && settings.private_key && runtime) address = (await bridge('wallet_address', { private_key: settings.private_key })).address;
  return {
    openrouter: { configured: Boolean(router.apiKey), default_model: router.model },
    opengradient: { hub_configured: Boolean(settings.email && settings.password), wallet_configured: Boolean(settings.private_key), address, payments_enabled: settings.payments_enabled },
    runtime: { ready: Boolean(runtime), version: runtime?.version, onnx_version: runtime?.onnx_version, error: runtime_error },
    models: runtime?.models || [],
  };
}
