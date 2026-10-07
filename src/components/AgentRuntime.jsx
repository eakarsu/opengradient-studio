import { useEffect, useState } from 'react';
import { api, date } from '../api';
import { Badge, ErrorState, Icon, Loading } from './ui';

export default function AgentRuntime({ id, onRun, onOpen, onManageModel, notify }) {
  const [data, setData] = useState(null);
  const [values, setValues] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function load(signal) {
    const result = await api(`/platform/agents/${id}/runtime`, { signal });
    setData(result);
    setValues({ ...result.settings, temperature: Number(result.settings.temperature) });
  }
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch(error => { if (error.name !== 'AbortError') setError(error.message); });
    return () => controller.abort();
  }, [id]);

  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const settings = await api(`/platform/agents/${id}/runtime`, {
        method: 'PUT', body: { memory_enabled: values.memory_enabled, temperature: values.temperature, max_tokens: values.max_tokens },
      });
      setData(current => ({ ...current, settings }));
      notify('Agent runtime settings saved. They apply to direct runs and workflows.');
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }

  async function clearMemory() {
    setBusy(true); setError('');
    try {
      await api(`/platform/agents/${id}/memory`, { method: 'DELETE' });
      await load(); setClearing(false); notify('Agent conversation memory cleared. Saved inference history is retained.');
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }

  if (!data) return error ? <ErrorState error={error} retry={() => { setError(''); load().catch(error => setError(error.message)); }}/> : <Loading text="Loading agent runtime…"/>;
  return <div className="agent-runtime">
    <div className="agent-runtime-summary"><Icon name="Bot" size={23}/><div><h3>Instructions, memory & execution</h3><p>{data.memory_messages} saved conversation messages. Runs use this agent’s model and saved instructions.</p></div></div>
    {error && <div className="form-error" role="alert">{error}</div>}
    <form className="platform-form" onSubmit={save}>
      <fieldset disabled={busy}>
        <label className="platform-checkbox"><input type="checkbox" checked={values.memory_enabled} onChange={event => setValues({ ...values, memory_enabled: event.target.checked })}/>Remember previous conversations for future runs</label>
        <div className="platform-grid">
          <label className="ai-field"><span>Creativity</span><input aria-label="Agent creativity" type="number" min="0" max="1" step="0.1" required value={values.temperature} onChange={event => setValues({ ...values, temperature: Number(event.target.value) })}/></label>
          <label className="ai-field"><span>Maximum response tokens</span><input aria-label="Agent maximum tokens" type="number" min="256" max="8192" step="1" required value={values.max_tokens} onChange={event => setValues({ ...values, max_tokens: Number(event.target.value) })}/></label>
        </div>
      </fieldset>
      <div className="platform-form-actions"><button type="button" className="button secondary" disabled={!data.agent.model_id} onClick={() => onManageModel(data.agent.model_id)}><Icon name="Settings2" size={15}/>Model files & runtime</button><button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save agent settings'}</button></div>
    </form>
    <div className="agent-memory-actions">{clearing ? <><p>Clear all {data.memory_messages} conversation messages? This cannot be undone. Saved inference results remain in history.</p><button className="button secondary small" disabled={busy} onClick={() => setClearing(false)}>Cancel</button><button className="button danger small" disabled={busy} onClick={clearMemory}>Clear conversation memory</button></> : <><span>Memory is used only when enabled.</span><button className="button secondary small" disabled={busy || !data.memory_messages} onClick={() => setClearing(true)}>Clear memory…</button></>}</div>
    <div className="workflow-history"><div className="agent-history-heading"><h3>Saved runs</h3><button className="button secondary small" onClick={() => onRun({ agentId: id })}><Icon name="Play" size={14}/>Run agent</button></div>{data.history.length ? data.history.map(run => <button key={run.id} onClick={() => onOpen('inferences', run.id)}><Badge value={run.status}/><span>{run.name}</span><span>{run.error || `${run.provider} · ${date(run.created_at)}`}</span><Icon name="ArrowUpRight" size={14}/></button>) : <p>Run the agent to save its response and start its conversation memory.</p>}</div>
  </div>;
}
