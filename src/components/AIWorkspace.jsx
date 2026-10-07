import { useEffect, useRef, useState } from 'react';
import { aiFeatures, aiFeatureMap, aiDefaults, aiExampleSets, presetValues } from '../../shared/ai-features.mjs';
import { entities, entityOrder } from '../../shared/entities.mjs';
import { api, date, number } from '../api';
import { Icon, Loading } from './ui';
import AIResponse, { readableResponse } from './AIResponse';

export function AIFeatureStrip({ entity, onAI }) {
  return <section className="ai-feature-strip" aria-label={`${entities[entity].title} AI tools`}><div className="ai-strip-heading"><span className="ai-icon small"><Icon name="Sparkles" size={17}/></span><div><strong>AI for {entities[entity].title.toLowerCase()}</strong><span>Full forms. Ready-to-use examples. Useful answers.</span></div><span className="ai-powered-label">OpenRouter</span></div><div className="ai-strip-tools">{aiFeatures.filter(feature => feature.entity === entity).map(feature => <button key={feature.id} onClick={() => onAI({ featureId: feature.id })}><Icon name={feature.icon} size={17}/><div><strong>{feature.title}</strong><span>{feature.description}</span></div><Icon name="ArrowUpRight" size={15}/></button>)}</div></section>;
}

function downloadFile(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AIWorkspace({ selected, onSelect, drafts, setDrafts, settings, onSettings, notify, initialRunId, onRunOpened }) {
  const feature = aiFeatureMap[selected] || aiFeatureMap['text-intelligence'];
  const [models, setModels] = useState([]);
  const [catalogUnavailable, setCatalogUnavailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    api('/ai/models', { signal: controller.signal }).then(data => { setModels(data.models); setCatalogUnavailable(Boolean(data.unavailable)); }).catch(error => { if (error.name !== 'AbortError') setCatalogUnavailable(true); });
    return () => controller.abort();
  }, []);
  const currentDraft = drafts[feature.id] || { values: aiDefaults(feature, settings?.default_model) };
  function updateDraft(draft) { setDrafts(current => ({ ...current, [feature.id]: draft })); }
  function fillAll(index) {
    setDrafts(Object.fromEntries(aiFeatures.map(tool => [tool.id, { values: presetValues(tool, index, settings?.default_model), preset: tool.presets[index].id }])));
    notify(`Filled every field in all ${aiFeatures.length} AI tools. Choose a tool to generate its response.`);
  }
  return <div className="ai-workspace">
    <div className="page-heading"><div><div className="eyebrow">INTELLIGENCE FOR YOUR WHOLE WORKSPACE</div><h1>AI Studio</h1><p>Give your work a clear brief. Get an answer you can use.</p></div><button className="button secondary" onClick={onSettings}><Icon name="Settings2" size={17}/>AI settings</button></div>
    <section className="ai-studio-banner"><div><span className="ai-banner-kicker"><Icon name="Sparkles" size={15}/>POWERED BY OPENROUTER</span><h2>From a filled-in brief<br/>to a thoughtful response.</h2><p>24 specialized tools, 72 complete examples, and one connected workspace.</p></div><div className="ai-banner-status"><span className={`ai-provider-state ${settings?.configured ? 'ready' : ''}`}><span/>{settings?.configured ? 'OpenRouter configured' : 'Connection needed'}</span><strong>One key. Every tool.</strong><button onClick={onSettings}>{settings?.configured ? 'Manage connection' : 'Connect OpenRouter'}<Icon name="ArrowUpRight" size={16}/></button></div></section>
    <section className="ai-fill-all" aria-label="Fill every AI tool"><div><Icon name="Layers3" size={21}/><div><strong>Fill every AI tool</strong><p>Choose an example set to populate all fields across all 24 tools. You decide which responses to generate.</p></div></div><div className="ai-fill-buttons">{aiExampleSets.map(example => <button className="button secondary small" key={example.id} title={example.description} onClick={() => fillAll(example.index)}><Icon name="WandSparkles" size={14}/>{example.label}</button>)}</div></section>
    <div className="ai-category-tabs" role="tablist" aria-label="AI tool categories">{entityOrder.map(entity => <button key={entity} role="tab" aria-selected={feature.entity === entity} className={feature.entity === entity ? 'selected' : ''} onClick={() => onSelect(aiFeatures.find(tool => tool.entity === entity).id)}><Icon name={entities[entity].icon} size={16}/>{entities[entity].title}</button>)}</div>
    <div className="ai-tool-cards">{aiFeatures.filter(tool => tool.entity === feature.entity).map(tool => <button key={tool.id} className={tool.id === feature.id ? 'selected' : ''} onClick={() => onSelect(tool.id)} aria-pressed={tool.id === feature.id}><span className="ai-icon small"><Icon name={tool.icon} size={20}/></span><div><strong>{tool.title}</strong><span>{tool.description}</span></div><Icon name="ArrowUpRight" size={16}/></button>)}</div>
    <AIWorkbench key={feature.id} feature={feature} draft={currentDraft} onDraft={updateDraft} settings={settings} models={models} catalogUnavailable={catalogUnavailable} onSettings={onSettings} notify={notify} initialRunId={initialRunId} onRunOpened={onRunOpened}/>
  </div>;
}

function AIWorkbench({ feature, draft, onDraft, settings, models, catalogUnavailable, onSettings, notify, initialRunId, onRunOpened }) {
  const values = draft.values;
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [history, setHistory] = useState(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyError, setHistoryError] = useState('');
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [opening, setOpening] = useState(false);
  const request = useRef(null);
  const report = useRef(null);
  const answerPanel = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (result && window.matchMedia('(max-width:960px)').matches) answerPanel.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth' });
  }, [result]);
  useEffect(() => {
    const controller = new AbortController();
    api(`/ai/runs?feature=${feature.id}&page=${historyPage}`, { signal: controller.signal }).then(data => { setHistory(data); setHistoryError(''); }).catch(error => { if (error.name !== 'AbortError') setHistoryError(error.message); });
    return () => controller.abort();
  }, [feature.id, historyPage, historyRefresh]);
  useEffect(() => {
    if (!initialRunId) return;
    openReport(initialRunId).finally(() => onRunOpened?.());
  }, [initialRunId]);
  function update(key, value) { onDraft({ ...draft, preset: null, values: { ...values, [key]: value } }); setErrors(current => ({ ...current, [key]: '' })); }
  function fillPreset(index) {
    onDraft({ values: presetValues(feature, index, settings?.default_model), preset: feature.presets[index].id });
    setError(''); setErrors({});
    notify(`${feature.presets[index].label}: every field is filled in.`);
  }
  async function generate(event) {
    event.preventDefault(); setError(''); setErrors({});
    if (!settings?.configured) { setError('Connect OpenRouter in AI settings, then generate your response.'); onSettings(); return; }
    const controller = new AbortController(); request.current = controller; setBusy(true);
    try {
      const response = await api('/ai/generate', { method: 'POST', signal: controller.signal, body: { feature_id: feature.id, values, source_record_id: draft.sourceRecordId || null } });
      setResult(response); setHistoryPage(1); setHistoryRefresh(value => value + 1); notify('Your AI response is ready and saved to PostgreSQL.');
    } catch (error) { if (error.name !== 'AbortError') { setError(error.message); setErrors(error.fields || {}); } }
    finally { if (request.current === controller) { setBusy(false); request.current = null; } }
  }
  async function openReport(id) {
    setOpening(true); setError('');
    try { const response = await api(`/ai/runs/${id}`); setResult(response); }
    catch (error) { setError(error.message); }
    finally { setOpening(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(readableResponse(result.response)); notify('AI response copied.'); }
    catch { notify('Select the response text to copy it.', 'error'); }
  }
  function exportReport() {
    const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    const content = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(result.title)}</title><style>body{font-family:system-ui,sans-serif;color:#26322f;max-width:860px;margin:64px auto;padding:0 28px;line-height:1.8}header{border-bottom:2px solid #e97249;padding-bottom:24px;margin-bottom:36px}header small{color:#75827d;text-transform:uppercase;letter-spacing:2px}header h1{line-height:1.3}h2,h3{margin-top:32px;line-height:1.4}table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #dfe5e2;padding:12px;text-align:left}th{background:#f3f7f5}pre{padding:20px;background:#f3f5f4;overflow:auto;white-space:pre-wrap}blockquote{border-left:3px solid #e97249;margin-left:0;padding-left:20px}a{color:#9e4c2f}footer{margin-top:48px;border-top:1px solid #dfe5e2;padding-top:20px;font-size:12px;color:#75827d}@media print{body{margin:20px auto}table,pre{break-inside:avoid}}</style></head><body><header><small>OpenGradient Studio · ${escape(feature.title)}</small><h1>${escape(result.title)}</h1><p>${escape(result.model)} · ${escape(date(result.created_at))}</p></header><article>${report.current?.innerHTML || ''}</article><footer>Generated through OpenRouter. Saved response ${escape(result.id)}.</footer></body></html>`;
    downloadFile(`opengradient-${feature.id}-report.html`, content, 'text/html;charset=utf-8'); notify('Formatted report downloaded.');
  }
  const selectedModel = models.find(model => model.id === values.model);
  return <>
    <div className="ai-workbench">
      <section className="ai-brief-panel" aria-label={`${feature.title} request`}>
        <header className="ai-panel-heading"><span className="ai-icon small"><Icon name={feature.icon} size={20}/></span><div><span className="ai-step">01 / YOUR BRIEF</span><h2>{feature.title}</h2></div><span className="ai-field-count">11 fields</span></header>
        <div className="ai-presets"><div><strong>Start with a complete example</strong><span>Each button fills every field.</span></div><div className="ai-preset-buttons">{feature.presets.map((preset, index) => <button key={preset.id} className={draft.preset === preset.id ? 'selected' : ''} disabled={busy} onClick={() => fillPreset(index)}><Icon name="WandSparkles" size={14}/>{preset.label}</button>)}</div></div>
        <form id={`ai-form-${feature.id}`} className="ai-form" onSubmit={generate}><fieldset disabled={busy}><div className="ai-form-grid">{feature.fields.map(field => <label key={field.key} className={`ai-field ${['textarea', 'model'].includes(field.type) || field.key === 'title' ? 'wide' : ''}`}><span>{field.label}{field.required && <i>*</i>}{field.type === 'textarea' && <em>{String(values[field.key] || '').length.toLocaleString()} / {field.maxLength.toLocaleString()}</em>}</span>
          {field.type === 'textarea' ? <textarea aria-label={field.label} rows={field.rows} required maxLength={field.maxLength} value={values[field.key] || ''} placeholder={`Describe ${field.label.toLowerCase()}, or choose an example above.`} aria-invalid={Boolean(errors[field.key])} onChange={event => update(field.key, event.target.value)}/>
          : field.type === 'select' ? <select aria-label={field.label} required value={values[field.key]} aria-invalid={Boolean(errors[field.key])} onChange={event => update(field.key, event.target.value)}>{field.options.map(option => <option key={option}>{option}</option>)}</select>
          : <input aria-label={field.label} type={field.type === 'number' ? 'number' : 'text'} required value={values[field.key] ?? ''} maxLength={field.maxLength} min={field.min} max={field.max} step={field.step} list={field.type === 'model' ? `ai-models-${feature.id}` : undefined} placeholder={field.type === 'model' ? 'Search by name or enter a model ID' : 'Give this request a name'} aria-invalid={Boolean(errors[field.key])} onChange={event => update(field.key, field.type === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value)}/>}
          {field.type === 'model' && <><datalist id={`ai-models-${feature.id}`}>{models.map(model => <option value={model.id} key={model.id}>{model.name}{model.free ? ' · Free' : ''}</option>)}</datalist><small>{selectedModel ? `${selectedModel.name}${selectedModel.free ? ' · Free model' : ' · Uses your OpenRouter credits'}` : catalogUnavailable ? 'Model catalog unavailable. You can still enter an OpenRouter model ID.' : 'Type to search the OpenRouter catalog, or enter a model ID.'}</small></>}
          {errors[field.key] && <small className="ai-field-error">{errors[field.key]}</small>}
        </label>)}</div></fieldset>
        {error && <div className="ai-error" role="alert"><Icon name="CircleAlert" size={17}/><span>{error}</span></div>}
        <div className="ai-generate-row"><span><Icon name="LockKeyhole" size={13}/>Sent to OpenRouter when you generate</span>{busy ? <button type="button" className="button secondary" onClick={() => request.current?.abort()}>Cancel request</button> : <button type="submit" className="button primary"><Icon name="Sparkles" size={17}/>Generate with AI<Icon name="ArrowRight" size={15}/></button>}</div></form>
      </section>
      <section ref={answerPanel} className="ai-answer-panel" aria-label="AI response" aria-busy={busy || opening}>
        <header className="ai-panel-heading"><span className="ai-icon small green"><Icon name="Sparkles" size={20}/></span><div><span className="ai-step">02 / YOUR RESPONSE</span><h2>{busy ? 'Creating your response' : result ? 'Ready for your next step' : 'A clearer way forward'}</h2></div>{result && !busy && <span className="ai-saved-badge"><Icon name="CircleCheck" size={12}/>Saved</span>}</header>
        {busy || opening ? <div className="ai-generating" role="status"><span className="ai-generating-orbit"><Icon name="Sparkles" size={30}/></span><h3>{opening ? 'Opening your saved response' : 'OpenRouter is working on your brief'}</h3><p>{opening ? 'Loading the report from your workspace.' : 'Your selected model is composing a response. It will appear here as a formatted report.'}</p><span className="spinner"/></div> : result ? <>
          <div className="ai-result-meta"><div><span>OPENROUTER RESPONSE</span><h3>{result.title}</h3></div><div className="ai-response-actions"><button aria-label="Copy AI response" title="Copy response" onClick={copy}><Icon name="Copy" size={16}/></button><button aria-label="Download formatted report" title="Download formatted report" onClick={exportReport}><Icon name="Download" size={16}/></button></div></div>
          <div className="ai-result-stats"><span><Icon name="Box" size={13}/>{models.find(model => model.id === result.model)?.name || result.model}</span><span>{(result.latency_ms / 1000).toFixed(1)}s</span><span>{number(result.total_tokens)} tokens</span>{result.cost_usd !== null && <span>${Number(result.cost_usd).toFixed(5)}</span>}</div>
          {result.truncated && <div className="ai-truncated"><Icon name="Info" size={15}/>The model reached your response token limit. Increase the limit and generate again for a longer answer.</div>}
          <div ref={report} className="ai-report-body"><AIResponse content={result.response}/></div><div className="ai-result-footer"><Icon name="Database" size={13}/>Saved {date(result.created_at)}<button onClick={() => { onDraft({ values: result.request }); notify('All request fields restored from this response.'); }}>Reuse this brief<Icon name="ArrowUpRight" size={13}/></button></div>
        </> : <div className="ai-answer-empty"><div className="ai-empty-illustration"><span/><span/><span/><Icon name="Sparkles" size={34}/></div><span className="ai-empty-kicker">GOOD ANSWERS START WITH A GOOD BRIEF</span><h3>Your ideas, thoughtfully developed.</h3><p>Choose a complete example, make it yours, and generate a response with clear findings, helpful tables, and practical next steps.</p><div className="ai-answer-benefits"><span><Icon name="List" size={14}/>Readable reports</span><span><Icon name="Database" size={14}/>Saved history</span><span><Icon name="Download" size={14}/>Ready to share</span></div>{!settings?.configured && <button className="button secondary" onClick={onSettings}><Icon name="LockKeyhole" size={15}/>Connect OpenRouter</button>}</div>}
      </section>
    </div>
    <section className="ai-history-panel"><div className="ai-history-heading"><div><Icon name="History" size={20}/><div><h2>Response history</h2><p>Your saved {feature.title.toLowerCase()} reports, ready to revisit.</p></div></div><button className="button small secondary" onClick={() => setHistoryRefresh(value => value + 1)}><Icon name="RefreshCw" size={14}/>Refresh</button></div>
      {historyError ? <div className="ai-error" role="alert">{historyError}</div> : !history ? <Loading text="Loading response history…"/> : !history.rows.length ? <div className="ai-history-empty">Your first AI response will appear here. Reports stay saved across restarts.</div> : <div className="ai-history-list">{history.rows.map(run => <button key={run.id} onClick={() => openReport(run.id)}><span className="ai-icon small"><Icon name={feature.icon} size={18}/></span><div><strong>{run.title}</strong><span>{run.model} · {date(run.created_at)}</span></div><span className="ai-history-tokens">{number(run.total_tokens)} tokens</span><Icon name="ArrowUpRight" size={16}/></button>)}</div>}
      {history?.pages > 1 && <div className="ai-history-pagination"><button className="button small secondary" disabled={historyPage === 1} onClick={() => setHistoryPage(value => value - 1)}>Previous</button><span>{historyPage} / {history.pages}</span><button className="button small secondary" disabled={historyPage >= history.pages} onClick={() => setHistoryPage(value => value + 1)}>Next</button></div>}
    </section>
  </>;
}
