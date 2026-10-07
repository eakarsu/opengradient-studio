import { useCallback, useEffect, useState } from 'react';
import { entities } from '../shared/entities.mjs';
import { aiFeatureMap, presetValues } from '../shared/ai-features.mjs';
import { api } from './api';
import { Icon, Logo, Modal } from './components/ui';
import Dashboard from './components/Dashboard';
import Collection from './components/Collection';
import RecordDialog from './components/RecordDialog';
import AIWorkspace from './components/AIWorkspace';
import AISettings from './components/AISettings';
import SearchDialog from './components/SearchDialog';
import { ModelHostingPage, PlaygroundPage, WorkflowPage, ConnectionsPage, ExecutionDialog } from './components/Platform';

const currentRoute = () => { const value = window.location.hash.replace('#/', ''); return ['ai', 'hosting', 'playground', 'workflows', 'connections'].includes(value) || Object.hasOwn(entities, value) ? value : 'overview'; };
const groups = [
  { title: 'WORKSPACE', items: [['overview', 'Overview', 'LayoutDashboard'], ['ai', 'AI Studio', 'Sparkles'], ['models', 'Model catalog', 'Box'], ['inferences', 'Inference jobs', 'Zap'], ['agents', 'AI agents', 'Bot']] },
  { title: 'BUILD & EXECUTE', items: [['hosting', 'Model hosting', 'Upload'], ['playground', 'Inference playground', 'Play'], ['workflows', 'Workflows', 'Workflow'], ['connections', 'Connections', 'Link']] },
  { title: 'INFRASTRUCTURE', items: [['nodes', 'Compute network', 'Network'], ['proofs', 'Verification center', 'ShieldCheck'], ['contracts', 'Smart contracts', 'FileCode2'], ['transactions', 'Transactions', 'ArrowLeftRight'], ['datasets', 'Datasets & memory', 'Database']] },
];

export default function App() {
  const [route, setRoute] = useState(currentRoute);
  const [refresh, setRefresh] = useState(0);
  const [overview, setOverview] = useState(null);
  const [overviewError, setOverviewError] = useState('');
  const [days, setDays] = useState(14);
  const [selection, setSelection] = useState(null);
  const [aiTool, setAiTool] = useState('text-intelligence');
  const [aiDrafts, setAiDrafts] = useState({});
  const [aiSettings, setAiSettings] = useState(null);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [execution, setExecution] = useState(null);
  const [hostingModelId, setHostingModelId] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState(null);
  const changed = useCallback(() => setRefresh(value => value + 1), []);
  const notify = useCallback((message, type = 'success') => setToast({ message, type, id: Date.now() }), []);
  useEffect(() => { const handler = () => { setRoute(currentRoute()); setMobileNav(false); window.scrollTo(0,0); }; window.addEventListener('hashchange', handler); return () => window.removeEventListener('hashchange', handler); }, []);
  useEffect(() => {
    const controller = new AbortController();
    api(`/overview?days=${days}`, { signal: controller.signal }).then(data => { setOverview(data); setOverviewError(''); }).catch(error => { if (error.name !== 'AbortError') setOverviewError(error.message); });
    return () => controller.abort();
  }, [days, refresh]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 6000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { const controller = new AbortController(); api('/ai/settings', { signal: controller.signal }).then(setAiSettings).catch(() => {}); return () => controller.abort(); }, []);
  useEffect(() => {
    const handler = event => { if ((event.metaKey || event.ctrlKey) && event.key === 'k') { event.preventDefault(); if (!selection && !aiSettingsOpen && !helpOpen) setSearchOpen(value => !value); } };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [selection, aiSettingsOpen, helpOpen]);
  function navigate(entity) { window.location.hash = `/${entity}`; }
  function openRecord(entity, id) { setSearchOpen(false); setSelection({ entity, id }); }
  function openAI({ featureId = 'text-intelligence', record } = {}) {
    const feature = aiFeatureMap[featureId] || aiFeatureMap['text-intelligence'];
    if (record) {
      const source = entities[feature.entity].fields.map(field => { const value = record.references?.[field.key] ?? record[field.key]; return `${field.label}: ${value === '' || value == null ? 'Not supplied' : value}`; }).join('\n');
      setAiDrafts(current => ({ ...current, [feature.id]: { values: { ...presetValues(feature, 0, aiSettings?.default_model), title: `${record.name} · AI review`.slice(0, 160), objective: `Analyze this ${entities[feature.entity].singular.toLowerCase()} record using your ${feature.title.toLowerCase()} expertise. Give evidence-based findings, recommendations, and next steps.`, source, constraints: 'Use only the supplied record. Identify missing evidence and state assumptions. Do not claim external execution or verification.', notes: 'Base your response on this workspace record. Distinguish supplied facts from assumptions and identify useful next steps.' }, sourceRecordId: record.id } }));
    }
    setAiTool(feature.id); setSelection(null); setSearchOpen(false); setMobileNav(false); navigate('ai'); window.scrollTo(0, 0);
  }
  function openRun(initial = {}) {
    setSelection(null);
    if (initial.modelId || initial.agentId) setExecution(initial);
    else navigate('playground');
  }
  function manageModel(id = '') { setHostingModelId(id); setSelection(null); navigate('hosting'); }

  return <div className="app-shell"><a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>Skip to content</a>
    {mobileNav && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)}/>}
    <aside id="workspace-navigation" className={`sidebar ${mobileNav ? 'open' : ''}`}><a className="brand" href="#/overview"><Logo/><span>OpenGradient<span className="studio-tag">STUDIO</span></span></a><div className="workspace-switch"><span className="workspace-avatar"><Icon name="Layers3" size={17}/></span><div><strong>Personal workspace</strong><span>Build something intelligent</span></div></div>
      <nav aria-label="Main navigation">{groups.map(group => <div className="nav-group" key={group.title}><div className="nav-label">{group.title}</div>{group.items.map(([key, label, icon]) => <a href={`#/${key}`} className={`nav-item ${route === key ? 'active' : ''}`} key={key} onClick={() => setMobileNav(false)} aria-current={route === key ? 'page' : undefined}><Icon name={icon} size={18}/><span>{label}</span>{key === 'models' && overview && <span className="nav-count">{overview.counts.models}</span>}{key === 'proofs' && <span className="nav-live-dot"/>}</a>)}</div>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-build-card"><span className="sidebar-orbit"><Icon name="Orbit" size={39}/></span><strong>Ideas deserve infrastructure.</strong><p>Start with a model.<br/>Build something that matters.</p><button onClick={() => openRun()}>Try the playground<Icon name="ArrowUpRight" size={14}/></button></div><button className="sidebar-help" onClick={() => setHelpOpen(true)}><Icon name="BookOpen" size={17}/>Documentation & help<Icon name="ArrowUpRight" size={14}/></button><div className="sidebar-user"><span className="user-avatar">OG</span><div><strong>Local developer</strong><span>Personal workspace</span></div><span className="user-status" title="Local workspace"/></div></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" aria-controls="workspace-navigation" aria-expanded={mobileNav} onClick={() => setMobileNav(true)}><Icon name="Menu" size={20}/></button><Icon name="PanelLeft" size={17} className="desktop-sidebar-icon"/><span className="breadcrumb-divider"/><span>Workspace</span><Icon name="ChevronRight" size={13}/><strong>{route === 'overview' ? 'Overview' : route === 'ai' ? 'AI Studio' : ({hosting:'Model hosting',playground:'Inference playground',workflows:'Workflows',connections:'Connections'}[route] || entities[route]?.title)}</strong></div><div className="topbar-actions"><button className="global-search-trigger" aria-label="Search workspace" onClick={() => setSearchOpen(true)}><Icon name="Search" size={16}/><span>Search anything…</span><kbd>⌘ K</kbd></button><span className="environment-pill"><span/>Local workspace</span><button className="icon-button help-top" aria-label="Workspace help" onClick={() => setHelpOpen(true)}><Icon name="CircleHelp" size={19}/></button><span className="topbar-avatar">OG</span></div></header>
      <main id="main-content" tabIndex={-1} className="main-content">{route === 'overview' ? <Dashboard data={overview} error={overviewError} retry={changed} days={days} setDays={setDays} onOpen={openRecord} onRun={openRun} navigate={navigate}/> : route === 'ai' ? <AIWorkspace selected={aiTool} onSelect={setAiTool} drafts={aiDrafts} setDrafts={setAiDrafts} settings={aiSettings} onSettings={() => setAiSettingsOpen(true)} notify={notify}/> : route === 'hosting' ? <ModelHostingPage key={hostingModelId} initialModelId={hostingModelId} notify={notify} onChanged={changed} onOpen={openRecord} onRun={openRun} navigate={navigate}/> : route === 'playground' ? <PlaygroundPage notify={notify} onChanged={changed} onOpen={openRecord} navigate={navigate}/> : route === 'workflows' ? <WorkflowPage notify={notify} onChanged={changed} navigate={navigate}/> : route === 'connections' ? <ConnectionsPage notify={notify} onAISettings={() => setAiSettingsOpen(true)}/> : <Collection key={route} entity={route} refresh={refresh} onOpen={openRecord} onCreate={entity => setSelection({ entity })} onRun={openRun} onManageModel={manageModel} onAI={openAI} navigate={navigate} notify={notify}/>}</main>
      <footer className="app-footer"><span>OpenGradient Studio <span className="footer-dot">·</span> Independent local workspace</span><span className="connection-state"><span className={`small-status-dot ${overviewError ? 'offline' : ''}`}/>{overviewError ? 'Connection unavailable' : overview ? 'PostgreSQL connected' : 'Connecting…'}</span></footer>
    </div>
    {selection && <RecordDialog key={`${selection.entity}-${selection.id || 'new'}`} selection={selection} onOpen={openRecord} onClose={() => setSelection(null)} onChanged={changed} onRun={openRun} onManageModel={manageModel} onAI={openAI} notify={notify}/>}
    {execution && <ExecutionDialog key={JSON.stringify(execution)} initial={execution} onClose={() => setExecution(null)} notify={notify} onChanged={changed} onOpen={(entity,id) => { setExecution(null); openRecord(entity,id); }} navigate={entity => { setExecution(null); navigate(entity); }}/>}
    {aiSettingsOpen && <AISettings settings={aiSettings} onClose={() => setAiSettingsOpen(false)} onSaved={setAiSettings} notify={notify}/> }
    {searchOpen && <SearchDialog onClose={() => setSearchOpen(false)} onOpen={openRecord}/>}
    {helpOpen && <Modal title="About your workspace" onClose={() => setHelpOpen(false)} className="help-modal"><header className="modal-header"><div className="modal-heading"><Logo/><h2>A workspace for open intelligence.</h2></div><button className="icon-button" aria-label="Close dialog" onClick={() => setHelpOpen(false)}><Icon name="X" size={20}/></button></header><div className="help-content"><p>Upload and version model files, run hosted AI or local ONNX predictions, and connect models and agents in workflows. The 24 AI Studio tools include complete presets and formatted reports. Your work persists in PostgreSQL.</p><div className="help-feature"><Icon name="Database"/><div><strong>Make it yours</strong><p>Add records, search and sort tables, switch to cards, or export a collection as CSV.</p></div></div><div className="help-feature"><Icon name="Zap"/><div><strong>Build & execute</strong><p>Start in Model hosting to upload weights or connect a provider. Run it in Inference playground, configure an agent under AI agents, or chain steps in Workflows. Connections manages provider credentials and checks the installed runtime.</p></div></div><div className="help-feature"><Icon name="FlaskConical"/><div><strong>Execution evidence</strong><p>Local SHA-256 receipts check saved content. OpenGradient network runs retain provider evidence and require your configured wallet. Model Hub publication requires your account. On-chain ML deployment uses the experimental alpha testnet. Seeded catalog entries and the local ledger are examples.</p></div></div><a className="docs-link" href="https://docs.opengradient.ai/" target="_blank" rel="noreferrer">Explore official OpenGradient documentation<Icon name="ArrowUpRight" size={16}/></a></div><footer className="modal-footer"><span/><button className="button primary" onClick={() => setHelpOpen(false)}>Back to workspace</button></footer></Modal>}
    {toast && <div className={`toast ${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}><Icon name={toast.type === 'error' ? 'CircleAlert' : 'CircleCheck'} size={18}/><span>{toast.message}</span><button aria-label="Dismiss notification" onClick={() => setToast(null)}><Icon name="X" size={15}/></button></div>}
  </div>;
}
