import { useEffect, useState } from 'react';
import { entities, defaultsFor } from '../../shared/entities.mjs';
import { aiFeatures } from '../../shared/ai-features.mjs';
import { api, date, short } from '../api';
import { Icon, Modal, EntityMark, Badge, Value, Loading, ErrorState } from './ui';
import AIResponse from './AIResponse';
import AgentRuntime from './AgentRuntime';

export default function RecordDialog({ selection, onClose, onChanged, onRun, onOpen, onManageModel, onAI, notify }) {
  const { entity, id } = selection;
  const config = entities[entity];
  const [record, setRecord] = useState(null);
  const [activity, setActivity] = useState([]);
  const [mode, setMode] = useState(id ? 'view' : 'create');
  const [tab, setTab] = useState('details');
  const [values, setValues] = useState(defaultsFor(entity));
  const [options, setOptions] = useState({});
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(id));
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    api(`/${entity}/${id}`, { signal: controller.signal }).then(data => { setRecord(data.record); setActivity(data.activity); }).catch(error => { if (error.name !== 'AbortError') setError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [entity, id, retry]);
  useEffect(() => {
    if (!['edit', 'create'].includes(mode)) return;
    const controller = new AbortController();
    Promise.all(config.fields.filter(field => field.type === 'reference').map(async field => [field.key, await api(`/options/${field.entity}`, { signal: controller.signal })])).then(entries => setOptions(Object.fromEntries(entries))).catch(error => { if (error.name !== 'AbortError') setError(error.message); });
    return () => controller.abort();
  }, [entity, mode]);

  function edit() { setValues({ ...record }); setFieldErrors({}); setError(''); setMode('edit'); }
  function cancel() { if (mode === 'view' || mode === 'create') onClose(); else { setMode('view'); setFieldErrors({}); setError(''); } }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setFieldErrors({});
    try {
      const body = Object.fromEntries(config.fields.filter(field => !field.readOnly).map(field => [field.key, values[field.key] ?? (field.type === 'reference' ? null : '')]));
      const updated = await api(record ? `/${entity}/${record.id}` : `/${entity}`, { method: record ? 'PATCH' : 'POST', body: { ...body, ...(record ? { revision: record.revision } : {}) } });
      setRecord(updated); setMode('view'); onChanged(); notify(`${config.singular} ${record ? 'updated' : 'created'}.`);
      const detail = await api(`/${entity}/${updated.id}`); setActivity(detail.activity);
    } catch (error) { setError(error.message); setFieldErrors(error.fields || {}); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError('');
    try { await api(`/${entity}/${record.id}`, { method: 'DELETE', body: { revision: record.revision } }); onChanged(); notify(`${config.singular} deleted.`); onClose(); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  async function verify() {
    setBusy(true); setError('');
    try {
      const result = await api(`/proofs/${record.id}/verify`, { method: 'POST' });
      setRecord(result.record); onChanged(); notify(result.message, result.valid ? 'success' : 'error');
      const detail = await api(`/proofs/${record.id}`); setActivity(detail.activity);
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  async function copy(value) { try { await navigator.clipboard.writeText(value); notify('Copied to clipboard.'); } catch { notify('Clipboard unavailable. Select and copy the text instead.', 'error'); } }
  const editing = mode === 'edit' || mode === 'create';

  return <Modal title={`${mode === 'create' ? 'Add' : mode === 'edit' ? 'Edit' : mode === 'delete' ? 'Delete' : 'View'} ${config.singular.toLowerCase()}`} onClose={onClose} busy={busy} className="record-modal">
    <header className="modal-header"><div className="modal-heading"><EntityMark entity={entity} record={record} size="large"/><div><div className="eyebrow">{config.singular.toUpperCase()}</div><h2>{mode === 'create' ? `Add ${config.singular.toLowerCase()}` : mode === 'delete' ? 'Delete this record?' : editing ? `Edit ${config.singular.toLowerCase()}` : record?.name || 'Record details'}</h2>{record && <div className="record-id"><span>{config.prefix}-{short(record.id)}</span><button className="copy-button" aria-label="Copy record ID" onClick={() => copy(record.id)}><Icon name="Copy" size={12}/></button></div>}</div></div><button className="icon-button" aria-label="Close dialog" onClick={onClose} disabled={busy}><Icon name="X" size={20}/></button></header>
    {loading ? <Loading text="Loading record…"/> : !record && id && error ? <ErrorState error={error} retry={() => setRetry(value => value + 1)}/> : <>
      {error && <div className="form-error" role="alert"><Icon name="CircleAlert" size={16}/>{error}</div>}
      {mode === 'delete' ? <div className="delete-confirm"><span className="delete-illustration"><Icon name="Trash2" size={29}/></span><h3>Delete “{record.name}”?</h3><p>This removes the record from your workspace. Related records stay in the database, with their links to this record cleared. This cannot be undone.</p></div> : editing ? <form id="record-form" onSubmit={save} className="record-form"><div className="form-grid">
        {config.fields.filter(field => !field.readOnly).map((field, index) => <label className={`form-field ${field.type === 'textarea' ? 'full-width' : ''}`} key={field.key}><span>{field.label}{field.required && <i>*</i>}</span>
          {field.type === 'select' || field.type === 'reference' ? <select aria-label={field.label} value={values[field.key] ?? ''} disabled={busy || (field.immutable && Boolean(record))} required={field.required} aria-invalid={Boolean(fieldErrors[field.key])} onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))}>{field.type === 'reference' && <option value="">{field.required ? 'Select a record…' : 'None'}</option>}{field.type === 'select' ? field.options.map(option => <option key={option}>{option}</option>) : (options[field.key] || []).map(option => <option key={option.id} value={option.id}>{option.name} · {option.status}</option>)}</select>
          : field.type === 'textarea' ? <textarea aria-label={field.label} rows={field.key === 'input' || field.key === 'output' ? 5 : 3} value={values[field.key] ?? ''} maxLength={field.maxLength || 5000} required={field.required} disabled={busy} aria-invalid={Boolean(fieldErrors[field.key])} placeholder={field.placeholder || `Add ${field.label.toLowerCase()}…`} onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))}/>
          : <input autoFocus={index === 0} aria-label={field.label} type={field.type === 'number' ? 'number' : 'text'} value={values[field.key] ?? ''} required={field.required} maxLength={field.maxLength || 255} min={field.min} max={field.max} step={field.integer ? 1 : field.step || 'any'} pattern={field.pattern} disabled={busy} aria-invalid={Boolean(fieldErrors[field.key])} placeholder={field.placeholder || field.label} onChange={event => setValues(current => ({ ...current, [field.key]: field.type === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value }))}/>}
          {fieldErrors[field.key] && <small className="field-error">{fieldErrors[field.key]}</small>}
        </label>)}
      </div><div className="form-hint"><Icon name="Database" size={14}/>Changes are saved to your PostgreSQL database.</div></form> : record && <>
        <div className="detail-tabs" role="tablist" aria-label="Record information"><button role="tab" aria-selected={tab === 'details'} className={tab === 'details' ? 'selected' : ''} onClick={() => setTab('details')}>Overview</button>{entity === 'agents' && <button role="tab" aria-selected={tab === 'runtime'} className={tab === 'runtime' ? 'selected' : ''} onClick={() => setTab('runtime')}>Runtime & memory</button>}<button role="tab" aria-selected={tab === 'activity'} className={tab === 'activity' ? 'selected' : ''} onClick={() => setTab('activity')}>Activity <span>{activity.length}</span></button><Badge value={record.status}/></div>
        <div className="record-body">{tab === 'runtime' ? <AgentRuntime id={record.id} onRun={onRun} onOpen={onOpen} onManageModel={onManageModel} notify={notify}/> : tab === 'activity' ? <div className="timeline">{activity.length ? activity.map(item => <div className="timeline-item" key={item.id}><span className="timeline-icon"><Icon name={item.action === 'verified' ? 'ShieldCheck' : item.action === 'updated' ? 'Pencil' : 'Plus'} size={15}/></span><div><strong>{config.singular} {item.action}</strong>{item.detail && <p>{item.detail}</p>}<time>{date(item.created_at)}</time></div></div>) : <div className="empty-activity"><Icon name="History" size={25}/><p>No changes yet. New edits will appear here.</p></div>}</div> : <>
          {record.description && <p className="record-description">{record.description}</p>}
          <dl className="detail-grid">{config.fields.filter(field => !['name', 'description', 'status', 'input', 'output', 'instructions'].includes(field.key)).map(field => <div className={['digest', 'tx_hash', 'storage_uri'].includes(field.key) ? 'wide-detail' : ''} key={field.key}><dt>{field.label}</dt><dd>{['digest', 'tx_hash', 'storage_uri', 'address', 'from_address', 'to_address'].includes(field.key) ? <span className="copy-value"><span className="mono wrap-text">{record[field.key] || '—'}</span>{record[field.key] && <button className="copy-button" aria-label={`Copy ${field.label.toLowerCase()}`} onClick={() => copy(record[field.key])}><Icon name="Copy" size={13}/></button>}</span> : <Value field={field} value={record[field.key]} record={record}/>}</dd></div>)}</dl>
          {['instructions', 'input', 'output'].filter(key => record[key]).map(key => <div className="text-detail" key={key}><div><h3>{key === 'instructions' ? 'Agent instructions' : key === 'input' ? 'Input' : 'Output'}</h3><button className="copy-button" aria-label={`Copy ${key}`} onClick={() => copy(record[key])}><Icon name="Copy" size={14}/></button></div>{key === 'output' ? <AIResponse content={record[key]}/> : <pre>{record[key]}</pre>}</div>)}
          <div className="record-timestamps"><span>Created {date(record.created_at)}</span><span>Revision {record.revision}</span></div>
        </>}</div>
      </>}
      <footer className="modal-footer"><div>{record && mode !== 'delete' && <button className="button danger-ghost" onClick={() => { setMode('delete'); setError(''); }} disabled={busy}><Icon name="Trash2" size={15}/>Delete</button>}</div><div className="modal-footer-actions"><button className="button secondary" onClick={cancel} disabled={busy}>Cancel</button>
        {mode === 'delete' ? <button className="button danger" onClick={remove} disabled={busy}>{busy ? 'Deleting…' : 'Delete record'}</button> : editing ? <button className="button primary" type="submit" form="record-form" disabled={busy}>{busy ? 'Saving…' : record ? 'Save changes' : `Create ${config.singular.toLowerCase()}`}</button> : record && <>
          {entity === 'proofs' && <button className="button secondary" onClick={verify} disabled={busy}><Icon name="ShieldCheck" size={15}/>{busy ? 'Checking…' : 'Verify receipt'}</button>}
          {entity === 'models' && <button className="button secondary" onClick={() => onManageModel(record.id)}><Icon name="Upload" size={15}/>Files & runtime</button>}
          {['models','agents'].includes(entity) && <button className="button secondary" onClick={() => onRun(entity === 'agents' ? { agentId: record.id } : { modelId: record.id })}><Icon name="Play" size={15}/>{entity === 'agents' ? 'Run agent' : 'Run model'}</button>}
          <button className="button secondary" onClick={() => onAI({ featureId: entity === 'agents' ? 'agent-execution' : aiFeatures.find(feature => feature.entity === entity).id, record })}><Icon name="Sparkles" size={14}/>Ask AI</button>
          <button className="button primary" onClick={edit} disabled={busy}><Icon name="Pencil" size={15}/>Edit</button>
        </>}
      </div></footer>
    </>}
  </Modal>;
}
