import { useEffect, useState } from 'react';
import { entities, entityOrder } from '../../shared/entities.mjs';
import { api } from '../api';
import { Modal, Icon, EntityMark, Loading, Empty } from './ui';

export default function SearchDialog({ onClose, onOpen }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    if (!query.trim()) { setResults([]); setLoading(false); return () => controller.abort(); }
    setLoading(true); setError('');
    const timer = setTimeout(() => {
      Promise.all(entityOrder.map(async entity => {
        const data = await api(`/${entity}?q=${encodeURIComponent(query)}&pageSize=15`, { signal: controller.signal });
        return data.rows.slice(0, 4).map(record => ({ entity, record }));
      })).then(groups => setResults(groups.flat())).catch(error => { if (error.name !== 'AbortError') setError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  return <Modal title="Search workspace" className="search-modal" onClose={onClose}><div className="global-search-input"><Icon name="Search" size={22}/><input autoFocus aria-label="Search all records" placeholder="Search models, agents, jobs, and more…" value={query} onChange={event => setQuery(event.target.value)}/><button className="keycap" onClick={onClose} aria-label="Close search">esc</button></div><div className="global-search-results">{error ? <div role="alert" className="form-error">{error}</div> : loading ? <Loading text="Searching your workspace…"/> : results.length ? results.map(({ entity, record }) => <button key={`${entity}-${record.id}`} onClick={() => onOpen(entity, record.id)}><EntityMark entity={entity} record={record}/><div><strong>{record.name}</strong><span>{entities[entity].title} · {record.status}</span></div><Icon name="ArrowUpRight" size={16}/></button>) : <Empty title={query ? 'No matching records' : 'Your whole workspace, one search.'} text={query ? 'Try another model name, status, or keyword.' : 'Search across all eight collections.'}/>}</div></Modal>;
}
