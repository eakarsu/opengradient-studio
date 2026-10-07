import { useEffect, useRef } from 'react';
import {
  ArrowDown, ArrowLeftRight, ArrowRight, ArrowUp, ArrowUpDown, ArrowUpRight,
  BadgeCheck, Blocks, BookOpen, Bot, Box, CalendarDays, ChevronDown, ChevronLeft,
  ChevronRight, CircleAlert, CircleCheck, CircleHelp, Copy, Database, Download,
  FileCode2, FlaskConical, Globe2, History, Info, Layers3, LayoutDashboard,
  LayoutGrid, List, ListFilter, LockKeyhole, Menu, Network, Orbit, PanelLeft,
  Pencil, Play, Plus, Search, SearchX, Server, ShieldCheck, Trash2, X, Zap,
  Sparkles, WandSparkles, Settings2, RefreshCw, Upload, Link, Wallet, Workflow,
} from 'lucide-react';
import { number, short, date } from '../api';

const Icons = {
  ArrowDown, ArrowLeftRight, ArrowRight, ArrowUp, ArrowUpDown, ArrowUpRight,
  BadgeCheck, Blocks, BookOpen, Bot, Box, CalendarDays, ChevronDown, ChevronLeft,
  ChevronRight, CircleAlert, CircleCheck, CircleHelp, Copy, Database, Download,
  FileCode2, FlaskConical, Globe2, History, Info, Layers3, LayoutDashboard,
  LayoutGrid, List, ListFilter, LockKeyhole, Menu, Network, Orbit, PanelLeft,
  Pencil, Play, Plus, Search, SearchX, Server, ShieldCheck, Trash2, X, Zap,
  Sparkles, WandSparkles, Settings2, RefreshCw, Upload, Link, Wallet, Workflow,
};

export function Icon({ name, size = 18, ...props }) {
  const Component = Icons[name] || Icons.Box;
  return <Component size={size} strokeWidth={1.7} {...props} />;
}

export function Logo({ small = false }) {
  return <span className={`brand-mark ${small ? 'small' : ''}`} aria-hidden="true"><svg viewBox="0 0 40 40" fill="none"><path d="M7 25V15l13-7 13 7v10l-13-7z" fill="currentColor"/><path d="m7 25 13 7 13-7-13-7z" fill="currentColor" opacity=".45"/></svg></span>;
}

export function Badge({ value }) {
  const color = ['Published', 'Completed', 'Active', 'Online', 'Valid', 'Registered', 'Ready', 'Simulated', 'Public', 'Connected'].includes(value) ? 'green'
    : ['Queued', 'Pending', 'Degraded', 'Processing', 'Paused', 'Deprecated', 'Checking'].includes(value) ? 'amber'
    : ['Failed', 'Invalid', 'Offline', 'Unavailable'].includes(value) ? 'red' : 'gray';
  return <span className={`badge ${color}`}><span className="badge-dot"/>{value || 'Unknown'}</span>;
}

export function EntityMark({ entity, record, size = '' }) {
  const icons = { models: 'Box', inferences: 'Zap', agents: 'Bot', nodes: 'Server', proofs: 'ShieldCheck', contracts: 'FileCode2', transactions: 'ArrowLeftRight', datasets: 'Database' };
  const variants = ['peach', 'mint', 'lavender', 'blue'];
  const index = record?.name ? [...record.name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4 : 0;
  return <span className={`entity-mark ${variants[index]} ${size}`}><Icon name={icons[entity]} size={size === 'large' ? 26 : size === 'tiny' ? 15 : 19}/></span>;
}

export function Value({ field, value, record, column }) {
  const key = field?.key || column;
  if (key === 'status') return <Badge value={value}/>;
  if (key === 'created_at' || key === 'updated_at') return <span className="muted text-nowrap">{date(value)}</span>;
  if (field?.type === 'reference') return <span>{record.references?.[key] || (value ? short(value) : 'Unlinked')}</span>;
  if (['digest', 'tx_hash', 'address', 'from_address', 'to_address'].includes(key)) return <span className="mono" title={value}>{short(value, 8)}</span>;
  if (key === 'verification' || key === 'scheme') return <span className="verification-tag"><Icon name="ShieldCheck" size={13}/>{value}</span>;
  if (key === 'utilization') return <span className="utilization"><span className="meter"><span style={{ width: `${value}%` }}/></span>{number(value)}%</span>;
  if (key === 'uptime') return <span className="positive">{number(value)}%</span>;
  if (key === 'latency_ms') return <span>{number(value)} <span className="muted">ms</span></span>;
  if (key === 'size_mb') return <span>{number(value)} MB</span>;
  if (key === 'amount' || key === 'cost') return <span>{Number(value).toFixed(4)} <span className="muted">cr</span></span>;
  if (key === 'budget') return <span>{number(value)} <span className="muted">cr</span></span>;
  if (field?.type === 'number') return <span>{number(value)}</span>;
  return <span>{value || '—'}</span>;
}

export function Modal({ title, children, onClose, className = '', busy = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog.showModal();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close(); document.body.style.overflow = oldOverflow;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  return <dialog ref={ref} aria-label={title} className={`modal ${className}`} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="modal-content">{children}</div>
  </dialog>;
}

export function Empty({ title = 'No records found', text = 'Try a different search or add your first record.', action }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name="SearchX" size={27}/></span><h3>{title}</h3><p>{text}</p>{action}</div>;
}

export function Loading({ text = 'Loading your workspace…' }) {
  return <div className="loading-state" role="status"><span className="spinner"/>{text}</div>;
}

export function ErrorState({ error, retry }) {
  return <div className="error-state" role="alert"><Icon name="CircleAlert"/><div><strong>We couldn’t load this view</strong><p>{error}</p></div>{retry && <button className="button secondary" onClick={retry}>Try again</button>}</div>;
}
