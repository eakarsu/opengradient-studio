import { useEffect, useState } from 'react';
import { api } from '../api';
import { Modal, Icon, Loading, Badge } from './ui';

export default function RunDialog({ initial, onClose, onChanged, onOpen, notify }) {
  const [models, setModels] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [modelId, setModelId] = useState(initial.modelId || '');
  const [nodeId, setNodeId] = useState('');
  const [input, setInput] = useState(initial.input || 'Analyze positive growth and stable liquidity of 1200000, with volatility risk of 0.042.');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([api('/options/models', { signal: controller.signal }), api('/options/nodes', { signal: controller.signal })]).then(([allModels, allNodes]) => {
      const published = allModels.filter(row => row.status === 'Published');
      setModels(published); setNodes(allNodes.filter(row => row.status === 'Online'));
      if (!initial.modelId) setModelId(published[0]?.id || '');
      else if (!published.some(row => row.id === initial.modelId)) setError('Publish the selected model before running it.');
    }).catch(error => { if (error.name !== 'AbortError') setError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  async function run(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const data = await api('/inferences/run', { method: 'POST', body: { model_id: modelId, node_id: nodeId || null, agent_id: initial.agentId || null, input } });
      setResult(data); onChanged(); notify('Run completed. Inference, receipt, and settlement saved.');
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  return <Modal title="Run sandbox inference" className="run-modal" onClose={onClose} busy={busy}>
    <header className="modal-header"><div className="modal-heading"><span className="entity-mark peach large"><Icon name="Zap" size={25}/></span><div><div className="eyebrow">INFERENCE PLAYGROUND</div><h2>{result ? 'Your result, with a receipt.' : 'From input to insight.'}</h2></div></div><button className="icon-button" aria-label="Close dialog" onClick={onClose} disabled={busy}><Icon name="X" size={20}/></button></header>
    {loading ? <Loading/> : <><div className="run-body"><div className="sandbox-callout"><Icon name="FlaskConical" size={18}/><div><strong>Local sandbox execution</strong><p>Runs deterministic text analysis and creates a SHA-256 receipt. Model and node selections are catalog references; no external model or blockchain is called.</p></div></div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {result ? <div className="run-result"><div className="result-title"><h3>Execution completed</h3><Badge value="Completed"/></div><div className="run-metrics"><span><strong>{result.inference.latency_ms} ms</strong>Local execution</span><span><strong>{result.inference.tokens}</strong>Estimated tokens</span><span><strong>SHA-256</strong>Integrity receipt</span></div><pre>{result.inference.output}</pre><button className="receipt-link" onClick={() => onOpen('proofs', result.proof.id)}><Icon name="ShieldCheck" size={17}/><span>View your integrity receipt</span><Icon name="ArrowUpRight" size={16}/></button></div> : <form id="run-form" onSubmit={run}><div className="form-grid"><label className="form-field"><span>Model <i>*</i></span><select aria-label="Model" required value={modelId} disabled={busy || Boolean(initial.agentId)} onChange={event => setModelId(event.target.value)}><option value="">Choose a published model</option>{models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label><label className="form-field"><span>Node reference <span className="muted">(optional)</span></span><select aria-label="Node reference" value={nodeId} disabled={busy} onChange={event => setNodeId(event.target.value)}><option value="">Local runner</option>{nodes.map(node => <option key={node.id} value={node.id}>{node.name}</option>)}</select></label><label className="form-field full-width"><span>Input <i>*</i><span className="field-counter">{input.length} / 20,000</span></span><textarea aria-label="Inference input" required rows={6} maxLength={20000} disabled={busy} value={input} onChange={event => setInput(event.target.value)}/></label></div><div className="run-flow"><span><Icon name="Box" size={15}/>Analyze input</span><Icon name="ChevronRight" size={14}/><span><Icon name="ShieldCheck" size={15}/>Create receipt</span><Icon name="ChevronRight" size={14}/><span><Icon name="Database" size={15}/>Save records</span></div></form>}
    </div><footer className="modal-footer"><span className="muted footer-caption"><Icon name="LockKeyhole" size={13}/>Your input stays local</span><div className="modal-footer-actions"><button className="button secondary" disabled={busy} onClick={onClose}>Cancel</button>{result ? <button className="button primary" onClick={() => onOpen('inferences', result.inference.id)}>Open inference<Icon name="ArrowUpRight" size={15}/></button> : <button className="button primary" type="submit" form="run-form" disabled={busy || !models.some(model => model.id === modelId)}><Icon name="Play" size={15}/>{busy ? 'Running…' : 'Run sandbox inference'}</button>}</div></footer></>}
  </Modal>;
}
