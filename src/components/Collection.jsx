import { useEffect, useState } from 'react';
import { api, number } from '../api';
import { entities } from '../../shared/entities.mjs';
import { Icon, Badge, EntityMark, Value, Empty, Loading, ErrorState } from './ui';
import { AIFeatureStrip } from './AIWorkspace';
import { ContractReader } from './Platform';

export default function Collection({ entity, refresh, onOpen, onCreate, onRun, onAI, navigate, notify }) {
  const config = entities[entity];
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [sort, setSort] = useState({ key: 'created_at', order: 'desc' });
  const [view, setView] = useState('table');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => { const timer = setTimeout(() => { setQuery(search); setPage(1); }, 250); return () => clearTimeout(timer); }, [search]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    const params = new URLSearchParams({ page, pageSize, q: query, status, category, sort: sort.key, order: sort.order });
    api(`/${entity}?${params}`, { signal: controller.signal }).then(result => {
      if (result.pages && page > result.pages) setPage(result.pages);
      else setData(result);
    }).catch(error => { if (error.name !== 'AbortError') setError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [entity, query, status, category, page, pageSize, sort, refresh, retry]);

  const categoryField = config.fields.find(field => field.key === 'category');
  function sortBy(key) { setSort(current => ({ key, order: current.key === key && current.order === 'asc' ? 'desc' : 'asc' })); setPage(1); }
  async function exportCsv() {
    try {
      const all = [];
      let currentPage = 1, pages = 1;
      do {
        const params = new URLSearchParams({ page: currentPage, pageSize: 100, q: query, status, category, sort: sort.key, order: sort.order });
        const result = await api(`/${entity}?${params}`); all.push(...result.rows); pages = result.pages; currentPage++;
      } while (currentPage <= pages);
      const fields = config.fields;
      const csvEscape = value => {
        let text = String(value ?? '');
        if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
        return `"${text.replaceAll('"', '""')}"`;
      };
      const csv = [fields.map(field => csvEscape(field.label)).join(','), ...all.map(row => fields.map(field => csvEscape(field.type === 'reference' ? row.references?.[field.key] : row[field.key])).join(','))].join('\r\n');
      const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' }));
      const link = document.createElement('a'); link.href = url; link.download = `opengradient-${entity}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify(`Exported ${all.length} records.`);
    } catch (error) { notify(error.message, 'error'); }
  }

  return <div className="collection-page">
    <div className="page-heading"><div><div className="eyebrow">YOUR WORKSPACE</div><h1>{config.title}</h1><p>{config.subtitle}</p></div><div className="heading-actions">
      {entity === 'models' && <button className="button secondary" onClick={() => navigate('hosting')}><Icon name="Upload" size={15}/>Upload & host model</button>}
      {entity === 'models' && <a className="button secondary" href="https://hub.opengradient.ai/" target="_blank" rel="noopener noreferrer">Official Model Hub<Icon name="ArrowUpRight" size={15}/></a>}
      {entity === 'agents' && <button className="button secondary" onClick={() => navigate('workflows')}><Icon name="Workflow" size={15}/>Build a workflow</button>}
      {entity === 'inferences' && <button className="button secondary" onClick={() => onRun()}><Icon name="Sparkles" size={15}/>Run AI</button>}
      <button className="button primary" onClick={() => onCreate(entity)}><Icon name="Plus" size={17}/>Add {config.singular.toLowerCase()}</button>
    </div></div>
    {entity === 'models' && <div className="subtle-notice"><Icon name="Info" size={16}/><span>This local catalog includes starter examples. Adding a record saves metadata; it does not download model weights. Use Model hosting to upload an ONNX file or connect an API model.</span></div>}
    {['proofs', 'contracts', 'transactions'].includes(entity) && <div className="subtle-notice"><Icon name="Info" size={16}/>{entity === 'proofs' ? 'Receipts verify local data integrity with SHA-256. They are not TEE attestations or zkML proofs.' : entity === 'contracts' ? 'Read live contract state below. Deployed OpenGradient alpha workflows are saved alongside your contract registrations.' : 'All transactions are local ledger records. No real funds move.'}</div>}
    {entity === 'contracts' && <ContractReader notify={notify}/>}
    <AIFeatureStrip entity={entity} onAI={onAI}/>
    <section className="panel collection-panel" aria-label={`${config.title} records`}>
      <div className="collection-tabs" role="tablist" aria-label="Filter by status">
        {['', ...config.statuses].map(value => <button key={value} role="tab" aria-selected={status === value} className={status === value ? 'selected' : ''} onClick={() => { setStatus(value); setPage(1); }}>{value || 'All records'}{!value && data && <span className="tab-count">{status ? 'All' : number(data.total)}</span>}</button>)}
      </div>
      <div className="table-toolbar"><div className="table-filters"><label className="search-field"><Icon name="Search" size={17}/><input aria-label={`Search ${config.title.toLowerCase()}`} placeholder={`Search ${config.title.toLowerCase()}…`} value={search} onChange={event => setSearch(event.target.value)}/>{search && <button aria-label="Clear search" onClick={() => setSearch('')}><Icon name="X" size={14}/></button>}</label>
        {categoryField && <label className="filter-select"><Icon name="ListFilter" size={16}/><select aria-label="Filter by category" value={category} onChange={event => { setCategory(event.target.value); setPage(1); }}><option value="">All categories</option>{categoryField.options.map(value => <option key={value}>{value}</option>)}</select></label>}
      </div><div className="table-view-actions"><button className="button small secondary export-button" onClick={exportCsv}><Icon name="Download" size={15}/>Export</button><div className="view-toggle" aria-label="Display mode"><button className={view === 'table' ? 'selected' : ''} aria-label="Table view" aria-pressed={view === 'table'} onClick={() => setView('table')}><Icon name="List" size={17}/></button><button className={view === 'cards' ? 'selected' : ''} aria-label="Card view" aria-pressed={view === 'cards'} onClick={() => setView('cards')}><Icon name="LayoutGrid" size={16}/></button></div></div></div>
      {error ? <ErrorState error={error} retry={() => setRetry(value => value + 1)}/> : loading ? <Loading text={`Loading ${config.title.toLowerCase()}…`}/> : !data?.rows.length ? <Empty action={<button className="button secondary" onClick={() => onCreate(entity)}>Add {config.singular.toLowerCase()}</button>}/> : view === 'table' ? <div className="table-scroll"><table className="data-table"><thead><tr>{config.columns.map(key => { const field = config.fields.find(field => field.key === key); return <th key={key} aria-sort={sort.key === key ? sort.order === 'asc' ? 'ascending' : 'descending' : 'none'}><button onClick={() => sortBy(key)}>{key === 'name' ? config.singular : key === 'created_at' ? 'Created' : field?.label.replace(' (demo credits)', '').replace(' (metadata)', '').replace('Target ', '')}<Icon name={sort.key === key ? sort.order === 'asc' ? 'ArrowUp' : 'ArrowDown' : 'ArrowUpDown'} size={12}/></button></th>; })}<th><span className="sr-only">Open record</span></th></tr></thead><tbody>{data.rows.map(row => <tr key={row.id} tabIndex={0} aria-label={`Open ${row.name}`} onClick={() => onOpen(entity, row.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(entity, row.id); } }}>
        {config.columns.map(key => <td key={key}>{key === 'name' ? <div className="name-cell"><EntityMark entity={entity} record={row}/><div><strong>{row.name}</strong><span>{row.owner || row.operator || `${config.prefix}-${row.id.slice(-6)}`}</span></div></div> : <Value field={config.fields.find(field => field.key === key)} value={row[key]} record={row} column={key}/>}</td>)}<td><Icon name="ChevronRight" size={15} className="row-arrow"/></td></tr>)}</tbody></table></div> : <div className="record-grid">{data.rows.map(row => <button className="record-card" key={row.id} onClick={() => onOpen(entity, row.id)}><div className="record-card-top"><EntityMark entity={entity} record={row}/><Badge value={row.status}/></div><h3>{row.name}</h3><p>{row.description || `${config.singular} in your OpenGradient workspace.`}</p><div className="record-card-meta"><span>{row.owner || row.operator || config.singular}</span><Icon name="ArrowUpRight" size={16}/></div></button>)}</div>}
      {data && !error && <div className="table-footer"><span>{data.total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, data.total)}` : '0'} of {number(data.total)} records</span><div className="pagination"><label>Rows per page<select aria-label="Rows per page" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{[15, 30, 60].map(size => <option key={size}>{size}</option>)}</select></label><span>{page} / {Math.max(1, data.pages)}</span><button className="icon-button" aria-label="Previous page" disabled={page === 1 || loading} onClick={() => setPage(value => value - 1)}><Icon name="ChevronLeft" size={17}/></button><button className="icon-button" aria-label="Next page" disabled={page >= data.pages || loading} onClick={() => setPage(value => value + 1)}><Icon name="ChevronRight" size={17}/></button></div></div>}
    </section>
  </div>;
}
