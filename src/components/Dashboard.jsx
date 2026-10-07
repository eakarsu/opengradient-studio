import { useId } from 'react';
import { Icon, Badge, EntityMark, Value, Loading, ErrorState } from './ui';
import { number } from '../api';

function NetworkArt() {
  return <svg className="network-art" viewBox="0 0 440 250" fill="none" aria-hidden="true">
    <defs><linearGradient id="edge" x1="80" y1="190" x2="360" y2="50"><stop stopColor="#487960" stopOpacity=".15"/><stop offset=".6" stopColor="#a5d9b0"/><stop offset="1" stopColor="#a5d9b0" stopOpacity=".2"/></linearGradient><linearGradient id="cube" x1="160" y1="80" x2="280" y2="180"><stop stopColor="#d2f0d3" stopOpacity=".28"/><stop offset="1" stopColor="#497d60" stopOpacity=".12"/></linearGradient></defs>
    {Array.from({ length: 9 }, (_, i) => <path key={i} d={`M${i * 45 - 10} 250L${i * 45 + 170} 0M0 ${i * 32}L440 ${i * 32 - 130}`} stroke="#8ec19b" opacity=".07"/>)}
    <ellipse cx="243" cy="135" rx="162" ry="54" transform="rotate(-25 243 135)" stroke="url(#edge)"/>
    <ellipse cx="243" cy="135" rx="126" ry="101" transform="rotate(33 243 135)" stroke="#81b992" strokeDasharray="3 8" opacity=".35"/>
    <path d="m240 48 76 44v88l-76 44-76-44V92z" fill="url(#cube)" stroke="#a6d5af" strokeOpacity=".55"/>
    <path d="m164 92 76 44 76-44m-76 44v88M202 70l76 44v88M202 202v-88l76-44M164 136l76 44 76-44" stroke="#aed9b6" strokeOpacity=".25"/>
    <path d="m213 123 27-16 27 16v31l-27 16-27-16z" fill="#b5e2bd" fillOpacity=".16" stroke="#d9f4d8" strokeWidth="1.4"/>
    <path d="m213 123 27 16 27-16m-27 16v31" stroke="#d9f4d8" strokeWidth="1.4"/>
    <path d="m99 185 65-49m152 0 51-40M240 48l22-32" stroke="#a6d5af" strokeOpacity=".45" strokeDasharray="3 4"/>
    {[[99,185],[367,96],[262,16],[140,68],[335,210]].map(([x,y],i) => <g key={i}><circle cx={x} cy={y} r="10" fill="#d2efc7" fillOpacity=".07"/><circle cx={x} cy={y} r="4" fill={i === 0 ? '#f19872' : '#c6e7ba'}/></g>)}
    <rect x="305" y="48" width="92" height="27" rx="7" fill="#203b2a" stroke="#48634e"/><text x="318" y="65" fill="#d6e5d7" fontSize="9" fontFamily="monospace">SHA-256 receipt</text>
    <rect x="76" y="211" width="92" height="27" rx="7" fill="#203b2a" stroke="#48634e"/><circle cx="91" cy="224" r="3" fill="#a7d697"/><text x="101" y="227" fill="#d6e5d7" fontSize="9" fontFamily="monospace">Local sandbox</text>
  </svg>;
}

function Chart({ points }) {
  const id = useId().replaceAll(':', '');
  const width = 720, height = 184, padding = 12;
  const max = Math.max(4, ...points.map(point => point.total));
  const xy = (value, i) => [padding + i * (width - padding * 2) / Math.max(1, points.length - 1), height - 14 - value / max * (height - 34)];
  const completed = points.map((point, i) => xy(point.completed, i));
  const total = points.map((point, i) => xy(point.total, i));
  const line = values => values.map(([x,y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ');
  return <div className="activity-chart"><div className="chart-y">{[max, Math.round(max * .75), Math.round(max * .5), Math.round(max * .25), 0].map((value, index) => <span key={index}>{value}</span>)}</div><div className="chart-body"><svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`Inference activity: ${points.reduce((sum, point) => sum + point.total, 0)} requests in this period`}>
    <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e98560" stopOpacity=".21"/><stop offset="100%" stopColor="#e98560" stopOpacity="0"/></linearGradient></defs>
    {[0, 1, 2, 3, 4].map(value => <line key={value} x1="0" x2={width} y1={20 + value * 37.5} y2={20 + value * 37.5} stroke="#e9ecef" strokeDasharray="3 5"/>)}
    <path d={`${line(completed)}L${width - padding},${height}L${padding},${height}Z`} fill={`url(#${id})`}/>
    <path d={line(total)} stroke="#b5beb8" strokeWidth="1.5" strokeDasharray="4 5" fill="none"/>
    <path d={line(completed)} stroke="#e7774e" strokeWidth="2.5" strokeLinejoin="round" fill="none"/>
    {completed.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="4" fill="#fff" stroke="#e7774e" strokeWidth="1.8"><title>{points[i].date}: {points[i].completed} completed / {points[i].total} total</title></circle>)}
  </svg><div className="chart-x">{points.filter((_, i) => i === 0 || i === points.length - 1 || i % Math.max(1, Math.floor(points.length / 5)) === 0).map(point => <span key={point.date}>{new Date(`${point.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>)}</div></div></div>;
}

function MiniMap() {
  const dots = [];
  for (let y = 8; y < 118; y += 6) {
    for (let x = 12; x < 310; x += 6) {
      const inEllipse = (cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1;
      if (inEllipse(66, 34, 42, 21) || inEllipse(48, 26, 31, 13) || inEllipse(96, 75, 17, 36) || inEllipse(163, 49, 23, 32) || inEllipse(205, 32, 58, 25) || inEllipse(230, 63, 27, 13) || inEllipse(262, 96, 25, 13) || inEllipse(130, 16, 12, 7)) dots.push([x, y]);
    }
  }
  return <svg className="mini-map" viewBox="0 0 320 128" role="img" aria-label="Illustration of compute inventory regions">{dots.map(([x,y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" fill="#d3dcd5"/>)}{[[72,36],[159,29],[246,51],[95,81]].map(([x,y],i) => <g key={i}><circle cx={x} cy={y} r="9" fill="#e8875d" opacity=".12"/><circle cx={x} cy={y} r="3" fill="#dd7648"/><circle cx={x} cy={y} r="5" fill="none" stroke="#dd7648" opacity=".4"/></g>)}</svg>;
}

export default function Dashboard({ data, error, retry, days, setDays, onOpen, onRun, navigate }) {
  if (error) return <ErrorState error={error} retry={retry}/>;
  if (!data) return <Loading/>;
  const { counts, metrics } = data;
  const stats = [
    { title: 'Registered models', value: counts.models, entity: 'models', icon: 'Box', foot: `${metrics.published_models} published and ready`, accent: 'peach' },
    { title: 'AI responses', value: metrics.ai_responses || 0, entity: 'ai', icon: 'Sparkles', foot: 'Generated through OpenRouter', accent: 'lavender' },
    { title: 'Active agents', value: metrics.active_agents, entity: 'agents', icon: 'Bot', foot: `${counts.agents} agents in your workspace`, accent: 'blue' },
    { title: 'Online compute nodes', value: metrics.online_nodes, entity: 'nodes', icon: 'Network', foot: `Across ${data.regions.length} regions`, accent: 'mint' },
  ];
  return <>
    <div className="page-heading"><div><div className="eyebrow">WORKSPACE OVERVIEW</div><h1>Good things start with intelligence.</h1><p>Your models, agents, and compute. All connected, all in one place.</p></div><button className="button primary" onClick={() => onRun()}><Icon name="Sparkles" size={17}/>Generate with AI</button></div>
    <section className="hero-banner"><div className="hero-copy"><div className="hero-eyebrow"><span/>THE NETWORK FOR OPEN INTELLIGENCE</div><h2>Intelligence without<br/>the black box.</h2><p>Build with open models. Run with confidence.<br/>Bring your next idea onchain.</p><button className="hero-button" onClick={() => navigate('models')}>Explore model hub<Icon name="ArrowUpRight" size={17}/></button></div><NetworkArt/><div className="hero-caption"><Icon name="Layers3" size={14}/>OPEN. CONNECTED. VERIFIABLE.</div></section>
    <div className="stats-grid">{stats.map(stat => <button className="stat-card" key={stat.entity} onClick={() => navigate(stat.entity)}><div className="stat-card-top"><span>{stat.title}</span><span className={`stat-icon ${stat.accent}`}><Icon name={stat.icon} size={17}/></span></div><strong>{number(stat.value)}</strong><div className="stat-card-bottom"><span><span className="small-status-dot"/>{stat.foot}</span><Icon name="ArrowUpRight" size={15}/></div></button>)}</div>
    <div className="overview-middle"><section className="panel inference-panel"><div className="panel-heading"><div><h2>Inference activity <span className="small-label">Sandbox</span></h2><p>A clear view of your model executions</p></div><label className="period-select"><Icon name="CalendarDays" size={14}/><select aria-label="Activity period" value={days} onChange={event => setDays(Number(event.target.value))}>{[7,14,30].map(day => <option key={day} value={day}>Last {day} days</option>)}</select></label></div><div className="chart-summary"><strong>{number(data.chart.reduce((sum, point) => sum + point.total, 0))}<span>total requests</span></strong><div className="chart-legend"><span><i className="orange"/>Completed</span><span><i/>All requests</span></div></div><Chart points={data.chart}/></section>
    <section className="panel compute-panel"><div className="panel-heading"><div><h2>Compute network</h2><p>Distributed by design</p></div><button className="icon-button" aria-label="View compute nodes" onClick={() => navigate('nodes')}><Icon name="ArrowUpRight" size={19}/></button></div><MiniMap/><div className="region-list">{data.regions.map(region => <button key={region.region} onClick={() => navigate('nodes')}><span><i/>{region.region}</span><span><strong>{region.online}</strong> / {region.total} online</span></button>)}</div><div className="network-note"><span className="small-status-dot"/>Sample network inventory<Icon name="Globe2" size={13}/></div></section></div>
    <section className="featured-section"><div className="section-heading"><div><h2>Explore the model hub</h2><p>The building blocks for your next big idea.</p></div><button className="text-button" onClick={() => navigate('models')}>View all models<Icon name="ArrowRight" size={15}/></button></div><div className="featured-grid">{data.featured.map(model => <button className="featured-card" key={model.id} onClick={() => onOpen('models', model.id)}><div className="featured-top"><EntityMark entity="models" record={model}/><span className="verification-tag"><Icon name="ShieldCheck" size={13}/>{model.verification} target</span></div><div className="model-publisher">{model.owner}<Icon name="BadgeCheck" size={13}/></div><h3>{model.name}</h3><p>{model.description}</p><div className="model-tags"><span>{model.category}</span><span>{model.parameters}</span></div><div className="featured-footer"><span><Icon name="Zap" size={13}/>{model.inference_count} runs</span><span><span className="small-status-dot"/>Published</span><Icon name="ArrowUpRight" size={15}/></div></button>)}</div></section>
    <section className="panel recent-panel"><div className="panel-heading"><div><h2>Recent inferences</h2><p>Your latest executions, with a traceable result.</p></div><button className="text-button" onClick={() => navigate('inferences')}>View all<Icon name="ArrowRight" size={15}/></button></div><div className="table-scroll"><table className="data-table compact-table"><thead><tr><th>Inference</th><th>Model</th><th>Status</th><th>Latency</th><th>Created</th><th/></tr></thead><tbody>{data.recent.map(row => <tr key={row.id} tabIndex={0} aria-label={`Open ${row.name}`} onClick={() => onOpen('inferences', row.id)} onKeyDown={event => { if (['Enter',' '].includes(event.key)) { event.preventDefault(); onOpen('inferences', row.id); } }}><td><div className="name-cell"><EntityMark entity="inferences" record={row} size="tiny"/><strong>{row.name}</strong></div></td><td>{row.references.model_id || 'Unlinked'}</td><td><Badge value={row.status}/></td><td><Value column="latency_ms" value={row.latency_ms}/></td><td><Value column="created_at" value={row.created_at}/></td><td><Icon name="ChevronRight" size={14}/></td></tr>)}</tbody></table>{!data.recent.length && <div className="empty-recent">Your next inference will appear here.</div>}</div></section>
    <div className="workspace-footnote"><span><Icon name="Database" size={13}/>All workspace changes are saved to PostgreSQL.</span><span>Built for open intelligence<LogoTiny/></span></div>
  </>;
}

function LogoTiny() { return <Icon name="Blocks" size={14}/>; }
