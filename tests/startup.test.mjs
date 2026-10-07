import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listenWithFallback, localUrl, parsePort } from '../server/listen.mjs';

const close = server => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));

test('startup skips an occupied port without interrupting the existing service', async t => {
  const existing = await listenWithFallback((req, res) => res.end('existing service'), { port: 0 });
  t.after(() => close(existing));
  const preferred = existing.address().port;
  const studio = await listenWithFallback((req, res) => res.end('studio'), { port: preferred });
  t.after(() => close(studio));
  assert.ok(studio.address().port > preferred);
  assert.equal(await (await fetch(localUrl('127.0.0.1', preferred))).text(), 'existing service');
  assert.equal(await (await fetch(localUrl('127.0.0.1', studio.address().port))).text(), 'studio');
});

test('strict startup fails clearly when its requested port is occupied', async t => {
  const existing = await listenWithFallback((req, res) => res.end(), { port: 0 });
  t.after(() => close(existing));
  await assert.rejects(listenWithFallback(() => {}, { port: existing.address().port, strictPort: true }), /Unset STRICT_PORT/);
  assert.ok(existing.listening);
});

test('startup stops after its configured range is exhausted', async t => {
  const existing = await listenWithFallback((req, res) => res.end(), { port: 0 });
  t.after(() => close(existing));
  const port = existing.address().port;
  await assert.rejects(listenWithFallback(() => {}, { port, attempts: 1 }), new RegExp(`No available port between ${port} and ${port}`));
});

test('an ephemeral port is reported using the actual bound address', async t => {
  const server = await listenWithFallback((req, res) => res.end('ready'), { port: 0 });
  t.after(() => close(server));
  assert.ok(server.address().port > 0);
  assert.equal(await (await fetch(localUrl('0.0.0.0', server.address().port))).text(), 'ready');
});

test('invalid port configuration fails before attempting to listen', async () => {
  for (const value of ['', ' ', 'abc', '4310.5', -1, 65536, Infinity]) {
    assert.throws(() => parsePort(value), /PORT must be a whole number/);
    await assert.rejects(listenWithFallback(() => {}, { port: value }), /PORT must be a whole number/);
  }
  assert.equal(parsePort('4311'), 4311);
  assert.equal(parsePort(0), 0);
  await assert.rejects(listenWithFallback(() => {}, { attempts: 0 }), /Port attempts/);
});

test('browser URLs support IPv6 and wildcard bind addresses', () => {
  assert.equal(localUrl('::1', 4310), 'http://[::1]:4310');
  assert.equal(localUrl('::', 4310), 'http://[::1]:4310');
  assert.equal(localUrl('0.0.0.0', 4310), 'http://127.0.0.1:4310');
  assert.equal(localUrl('localhost', 4311), 'http://localhost:4311');
});
