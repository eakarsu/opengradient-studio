import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBlockchainReader } from '../server/blockchain.mjs';
import { networks } from '../shared/platform.mjs';

const unreachable = code => Object.assign(new TypeError('fetch failed'), { cause: { code, message: 'Private provider diagnostics must not appear' } });
const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
const mockReader = (values = {}) => createBlockchainReader({ fetchImpl: async (url, options) => {
  const method = JSON.parse(options.body).method;
  return json({ jsonrpc: '2.0', id: 1, result: method === 'eth_chainId' ? values.chain ?? '0x2105' : Object.hasOwn(values, 'block') ? values.block : '0x123' });
} });

test('deprecated alpha DNS failure is unavailable and never silently uses another chain', async () => {
  const requested = [];
  const reader = createBlockchainReader({ fetchImpl: async url => { requested.push(url); throw unreachable('ENOTFOUND'); } });
  const status = await reader.status('alpha');
  assert.equal(status.connected, false); assert.equal(status.status, 'unavailable');
  assert.equal(status.reason, 'dns'); assert.equal(status.deprecated, true);
  assert.match(status.error, /deprecated.*hostname could not be resolved/);
  assert.match(status.error, /ML inference and deployment are unavailable/);
  assert.doesNotMatch(status.error, /Try again shortly|Private provider/);
  assert.equal(status.rpc, networks.alpha.rpc);
  assert.deepEqual([...new Set(requested)], [networks.alpha.rpc]);
  assert.ok(status.checked_at); assert.ok(status.latency_ms >= 0);
});

test('supported chains must return their expected chain ID and a real block to connect', async () => {
  const reader = createBlockchainReader({ fetchImpl: async (url, options) => {
    const network = Object.values(networks).find(network => network.rpc === url);
    const method = JSON.parse(options.body).method;
    return json({ result: method === 'eth_chainId' ? `0x${network.chainId.toString(16)}` : '0x1234' });
  } });
  for (const network of ['opengradient', 'base', 'ethereum', 'alpha']) {
    const status = await reader.status(network);
    assert.equal(status.connected, true); assert.equal(status.status, 'connected');
    assert.equal(status.chain_id, networks[network].chainId); assert.equal(status.block_number, 0x1234);
  }
  // A deprecated network may recover; it must still pass the same live checks.
});

test('an endpoint reporting the wrong chain cannot be shown as connected', async () => {
  const status = await mockReader({ chain: '0x1' }).status('base');
  assert.equal(status.connected, false); assert.equal(status.reason, 'wrong_chain');
  assert.match(status.error, /chain 1; expected 8453/);
});

test('malformed and unsafe numeric RPC replies produce a readable unavailable result', async () => {
  for (const values of [{ chain: 'invalid' }, { chain: { id: 8453 } }, { block: null }, { block: '0x' }, { block: '0xffffffffffffffffffff' }]) {
    const status = await mockReader(values).status('base');
    assert.equal(status.connected, false); assert.equal(status.reason, 'invalid_response');
    assert.match(status.error, /invalid chain or block information/);
  }
});

test('DNS, timeout, certificate and transport failures have distinct actionable diagnoses', async () => {
  const cases = [
    { error: unreachable('EAI_AGAIN'), reason: 'dns', message: /hostname could not be resolved/ },
    { error: unreachable('UND_ERR_CONNECT_TIMEOUT'), reason: 'timeout', message: /timed out/ },
    { error: unreachable('CERT_HAS_EXPIRED'), reason: 'tls', message: /certificate could not be validated/ },
    { error: unreachable('ECONNREFUSED'), reason: 'network', message: /could not be reached/ },
  ];
  for (const item of cases) {
    const reader = createBlockchainReader({ fetchImpl: async () => { throw item.error; } });
    const status = await reader.status('base');
    assert.equal(status.connected, false); assert.equal(status.reason, item.reason);
    assert.match(status.error, item.message); assert.doesNotMatch(status.error, /Private provider/);
  }
});

test('HTTP, RPC and unreadable response failures do not blame health-check function arguments', async () => {
  const cases = [
    { response: new Response('Provider unavailable', { status: 503 }), reason: 'http', message: /HTTP 503/ },
    { response: json({ error: { code: -32000, message: 'Private provider diagnostics' } }), reason: 'rpc', message: /rejected the connection check/ },
    { response: new Response('<html>error</html>'), reason: 'invalid_response', message: /unreadable response/ },
    { response: json({ jsonrpc: '2.0', id: 1 }), reason: 'invalid_response', message: /invalid response/ },
  ];
  for (const item of cases) {
    const reader = createBlockchainReader({ fetchImpl: async () => item.response.clone() });
    const status = await reader.status('base');
    assert.equal(status.connected, false); assert.equal(status.reason, item.reason);
    assert.match(status.error, item.message); assert.doesNotMatch(status.error, /function arguments|Private provider/);
  }
});

test('a failure while reading the response body remains a timeout', async () => {
  const reader = createBlockchainReader({ fetchImpl: async () => ({ ok: true, json: async () => { throw new DOMException('Timeout', 'TimeoutError'); } }) });
  const status = await reader.status('base');
  assert.equal(status.connected, false); assert.equal(status.reason, 'timeout');
});

test('contract execution on an unavailable network fails instead of returning a fabricated result', async () => {
  const reader = createBlockchainReader({ fetchImpl: async () => { throw unreachable('ENOTFOUND'); } });
  await assert.rejects(reader.read({ network: 'alpha', address: '0xFbC2051AE2265686a469421b2C5A2D5462FbF5eB', signature: 'function totalSupply() view returns (uint256)', args: [] }), error => error.status === 502 && error.reason === 'dns');
});

test('unknown networks are rejected before making requests', async () => {
  let calls = 0;
  const reader = createBlockchainReader({ fetchImpl: async () => { calls++; } });
  for (const network of ['missing', '__proto__']) await assert.rejects(reader.status(network), error => error.status === 422);
  assert.equal(calls, 0);
});
