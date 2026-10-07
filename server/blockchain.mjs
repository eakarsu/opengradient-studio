import { Interface, getAddress } from 'ethers';
import { networks } from '../shared/platform.mjs';
import { problem } from './bridge.mjs';

const connectionError = (message, reason, status = 502) => Object.assign(problem(status, message), { reason });
const quantity = value => {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value) || BigInt(value) > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw connectionError('The network endpoint returned invalid chain or block information.', 'invalid_response');
  }
  return Number(BigInt(value));
};

export function createBlockchainReader({ fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  function networkConfig(network) {
    if (!Object.hasOwn(networks, network)) throw problem(422, 'Choose a supported blockchain network.');
    return networks[network];
  }
  function transportError(error, selected, signal, transportSignal) {
    if (signal?.aborted) return connectionError('The connection check was cancelled.', 'cancelled', 499);
    const code = error.cause?.code || error.code;
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
      const message = selected.deprecated
        ? `${selected.name} is deprecated, and its RPC hostname could not be resolved. Alpha ML inference and deployment are unavailable through this endpoint.`
        : `${selected.name}'s RPC hostname could not be resolved. The network endpoint is unavailable.`;
      return connectionError(message, 'dns');
    }
    if (transportSignal.reason?.name === 'TimeoutError' || error.name === 'TimeoutError' || code === 'UND_ERR_CONNECT_TIMEOUT') {
      return connectionError(`${selected.name}'s network endpoint timed out. Check again later.`, 'timeout', 504);
    }
    if (/CERT|TLS|SELF_SIGNED/.test(String(code))) {
      return connectionError(`A secure connection to ${selected.name} could not be established. Its endpoint certificate could not be validated.`, 'tls');
    }
    return connectionError(`${selected.name}'s network endpoint could not be reached. Check your internet connection or the provider's service status.`, 'network');
  }
  async function rpc(network, method, params = [], signal) {
    const selected = networkConfig(network);
    const transportSignal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(timeoutMs)]);
    let response;
    try { response = await fetchImpl(selected.rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: transportSignal }); }
    catch (error) { throw transportError(error, selected, signal, transportSignal); }
    if (!response.ok) {
      response.body?.cancel().catch(() => {});
      throw connectionError(`${selected.name}'s endpoint returned HTTP ${response.status}. The provider could not complete the connection.`, 'http');
    }
    let body;
    try { body = await response.json(); }
    catch (error) {
      if (error instanceof SyntaxError) throw connectionError(`${selected.name}'s endpoint returned an unreadable response.`, 'invalid_response');
      throw transportError(error, selected, signal, transportSignal);
    }
    if (!body || typeof body !== 'object' || !Object.hasOwn(body, 'result') && !body.error) throw connectionError(`${selected.name}'s endpoint returned an invalid response.`, 'invalid_response');
    if (body.error) throw connectionError(method === 'eth_call'
      ? `The ${selected.name} RPC could not complete this contract read. Check the address, function, and arguments.`
      : `${selected.name}'s endpoint rejected the connection check. Check the provider's service status.`, 'rpc');
    return body.result;
  }
  async function read({ network, address, signature, args = [] }, signal) {
    let target, iface, fragment;
    try {
      target = getAddress(address);
      iface = new Interface([signature]);
      fragment = iface.fragments.find(item => item.type === 'function');
      if (!fragment || !['view', 'pure'].includes(fragment.stateMutability)) throw new Error();
    } catch { throw problem(422, 'Provide a valid contract address and a view or pure function signature.'); }
    let data;
    try { data = iface.encodeFunctionData(fragment, args); }
    catch { throw problem(422, 'The arguments do not match this contract function.'); }
    const [block, chainId] = await Promise.all([rpc(network, 'eth_blockNumber', [], signal), rpc(network, 'eth_chainId', [], signal)]);
    if (quantity(chainId) !== networks[network].chainId) throw connectionError('The RPC reported an unexpected chain ID.', 'wrong_chain');
    const raw = await rpc(network, 'eth_call', [{ to: target, data }, block], signal);
    let decoded;
    try { decoded = iface.decodeFunctionResult(fragment, raw); }
    catch { throw problem(422, 'This contract returned data that does not match the function signature.'); }
    const normalize = value => typeof value === 'bigint' ? value.toString() : Array.isArray(value) ? value.map(normalize) : value;
    const values = decoded.map((value, index) => ({ name: fragment.outputs[index]?.name || `Result ${index + 1}`, type: fragment.outputs[index]?.type, value: normalize(value) }));
    return { network, network_name: networks[network].name, address: target, method: fragment.format('sighash'), block_number: quantity(block), values, explorer_url: `${networks[network].explorer}/address/${target}` };
  }
  async function status(network) {
    const selected = networkConfig(network), started = performance.now();
    const details = () => ({ ...selected, network, checked_at: new Date().toISOString(), latency_ms: Math.round(performance.now() - started) });
    try {
      const [block, chain] = await Promise.all([rpc(network, 'eth_blockNumber'), rpc(network, 'eth_chainId')]);
      const block_number = quantity(block), chain_id = quantity(chain);
      if (chain_id !== selected.chainId) throw connectionError(`${selected.name}'s endpoint reported chain ${chain_id}; expected ${selected.chainId}. It cannot be used for this network.`, 'wrong_chain');
      return { ...details(), block_number, chain_id, connected: true, status: 'connected' };
    } catch (error) {
      return { ...details(), connected: false, status: 'unavailable', reason: error.reason || 'network', error: error.message };
    }
  }
  return { read, status, rpc };
}
