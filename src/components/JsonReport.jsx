/**
 * JsonReport — professional renderer for OpenRouter (and other) JSON responses.
 *
 * Portable: React only, no UI-library or CSS-framework dependency. Drop into any
 * Vite or Next.js app. Handles:
 *   - already-parsed objects/arrays
 *   - JSON strings, including ```json fenced blocks
 *   - nested objects and arrays of objects (rendered as tables)
 *   - a syntax-highlighted, collapsible raw JSON view
 *
 * Usage:
 *   import JsonReport from './JsonReport';
 *   <JsonReport data={response} title="AI report" model={model} />
 *   <JsonReport raw={providerText} title="AI report" />
 *
 * For TypeScript apps use JsonReport.tsx.
 */
import React, { useMemo, useState } from 'react';

const META_KEYS = new Set([
  'ok', 'id', 'model', 'model_used', 'tokens_used', 'tokensUsed', 'usage',
  'receipt', 'created_at', 'updated_at', 'user_id', 'request_id', 'latency_ms',
]);

export const prettyLabel = (key) =>
  String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());

/** Parse a value that may be an object, a JSON string, or fenced JSON. */
export function parseJsonValue(input) {
  if (input === null || input === undefined) return undefined;
  if (typeof input === 'object') return input;
  if (typeof input !== 'string') return undefined;
  let text = input.trim();
  const fence = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  if (fence) text = fence[1].trim();
  if (!/^[[{]/.test(text)) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Extract the structured payload from common provider envelopes. */
export function unwrapProviderValue(value, depth = 0) {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  for (const key of ['result_json', 'structured', 'parsed', 'json', 'data']) {
    if (value[key] && typeof value[key] === 'object') return unwrapProviderValue(value[key], depth + 1);
  }
  for (const key of ['raw', 'content', 'ai_response', 'response', 'result', 'output', 'answer', 'text']) {
    if (typeof value[key] === 'string') {
      const parsed = parseJsonValue(value[key]);
      if (parsed !== undefined) return unwrapProviderValue(parsed, depth + 1);
    }
  }
  const entries = Object.entries(value).filter(([key]) => !META_KEYS.has(key));
  return entries.length ? Object.fromEntries(entries) : value;
}

/** Flatten a value into a copy/download-friendly plain-text report. */
export function jsonReportText(value, depth = 0) {
  if (value === null || value === undefined) return 'Not provided';
  if (value === '') return '""';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    if (!value.length) return 'None reported';
    return value.map((item) => `${'  '.repeat(depth)}• ${jsonReportText(item, depth + 1)}`).join('\n');
  }
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, item]) => `${'  '.repeat(depth)}${prettyLabel(key)}\n${jsonReportText(item, depth + 1)}`)
      .join('\n\n');
  }
  return String(value);
}

const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isScalar = (v) => v === null || typeof v !== 'object';

function Inline({ text }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} style={styles.code}>{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) return <a key={i} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function Section({ title, children }) {
  return (
    <section style={styles.section}>
      <h3 style={styles.sectionTitle}>{title}</h3>
      {children}
    </section>
  );
}

function Scalar({ value }) {
  if (value === null || value === undefined) return <span style={styles.muted}>Not provided</span>;
  if (value === '') return <span style={styles.muted}>""</span>;
  if (typeof value === 'boolean') return <span style={value ? styles.badgeYes : styles.badgeNo}>{value ? 'Yes' : 'No'}</span>;
  if (typeof value === 'number') return <span style={styles.number}>{value.toLocaleString()}</span>;
  const text = String(value);
  if (text.includes('\n')) {
    return (
      <div style={styles.prose}>
        {text.split('\n').filter((line) => line.trim()).map((line, i) => (
          <p key={i} style={styles.paragraph}><Inline text={line} /></p>
        ))}
      </div>
    );
  }
  return <span style={styles.text}><Inline text={text} /></span>;
}

function Facts({ entries }) {
  return (
    <dl style={styles.facts}>
      {entries.map(([key, value]) => (
        <div key={key} style={styles.factRow}>
          <dt style={styles.factKey}>{prettyLabel(key)}</dt>
          <dd style={styles.factValue}>{isScalar(value) ? <Scalar value={value} /> : <Value value={value} depth={1} />}</dd>
        </div>
      ))}
    </dl>
  );
}

function Table({ rows }) {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>{keys.map((key) => <th key={key} style={styles.th}>{prettyLabel(key)}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={i % 2 ? styles.trAlt : undefined}>
              {keys.map((key) => (
                <td key={key} style={styles.td}>{isScalar(row[key]) ? <Scalar value={row[key]} /> : <Value value={row[key]} depth={2} />}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Value({ value, depth = 0, label }) {
  if (depth > 12) return <span style={styles.muted}>Additional nested detail is available in the raw JSON and download.</span>;
  if (isScalar(value)) return <Scalar value={value} />;

  if (Array.isArray(value)) {
    if (!value.length) return <span style={styles.muted}>None reported</span>;
    const allObjects = value.every(isPlainObject);
    if (allObjects) return <Table rows={value} />;
    return (
      <ol style={styles.list}>
        {value.map((item, i) => <li key={i} style={styles.listItem}><Value value={item} depth={depth + 1} /></li>)}
      </ol>
    );
  }

  const entries = Object.entries(value);
  if (!entries.length) return <span style={styles.muted}>No details supplied</span>;
  const shallow = entries.every(([, v]) => isScalar(v) || (Array.isArray(v) && v.every(isScalar)));
  if (shallow || depth === 0) return <Facts entries={entries} />;
  return (
    <div style={styles.sections}>
      {entries.map(([key, item]) => (
        <Section key={key} title={prettyLabel(key)}>
          <Value value={item} depth={depth + 1} />
        </Section>
      ))}
    </div>
  );
}

/** Syntax-highlighted, collapsible JSON tree. */
function JsonNode({ name, value, depth = 0, last = true }) {
  const [open, setOpen] = useState(depth < 2);
  const indent = { paddingLeft: `${depth * 14}px` };
  if (isScalar(value)) {
    return (
      <div style={{ ...styles.jsonLine, ...indent }}>
        {name !== undefined && <span style={styles.jsonKey}>{JSON.stringify(name)}: </span>}
        <span style={jsonScalarStyle(value)}>{JSON.stringify(value)}</span>
        {!last && <span style={styles.jsonPunct}>,</span>}
      </div>
    );
  }
  const entries = Array.isArray(value) ? value.map((v, i) => [i, v]) : Object.entries(value);
  const bracket = Array.isArray(value) ? ['[', ']'] : ['{', '}'];
  return (
    <div>
      <div style={{ ...styles.jsonLine, ...indent, cursor: 'pointer' }} onClick={() => setOpen((o) => !o)}>
        <span style={styles.jsonToggle}>{open ? '▾' : '▸'}</span>
        {name !== undefined && <span style={styles.jsonKey}>{JSON.stringify(name)}: </span>}
        <span style={styles.jsonPunct}>{bracket[0]}</span>
        {!open && <span style={styles.jsonEllipsis}> … {entries.length} {Array.isArray(value) ? 'items' : 'keys'} </span>}
        {!open && <span style={styles.jsonPunct}>{bracket[1]}{!last ? ',' : ''}</span>}
      </div>
      {open && (
        <div>
          {entries.map(([key, item], i) => (
            <JsonNode key={key} name={Array.isArray(value) ? undefined : key} value={item} depth={depth + 1} last={i === entries.length - 1} />
          ))}
          <div style={{ ...styles.jsonLine, ...indent }}>
            <span style={styles.jsonPunct}>{bracket[1]}{!last ? ',' : ''}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function jsonScalarStyle(value) {
  if (value === null) return styles.jsonNull;
  if (typeof value === 'string') return styles.jsonString;
  if (typeof value === 'number') return styles.jsonNumber;
  if (typeof value === 'boolean') return styles.jsonBoolean;
  return styles.jsonText;
}

export default function JsonReport({ data, raw, title = 'AI report', model, tokens, loading, error, onRetry }) {
  const [view, setView] = useState('report');
  const [copied, setCopied] = useState(false);

  const value = useMemo(() => {
    const source = data !== undefined ? data : raw;
    const parsed = parseJsonValue(source);
    const resolved = parsed !== undefined ? parsed : source;
    return isPlainObject(resolved) || Array.isArray(resolved) ? unwrapProviderValue(resolved) : resolved;
  }, [data, raw]);

  if (loading) {
    return (
      <section style={styles.container} role="status">
        <div style={styles.loadingDot} />
        <h3 style={styles.title}>Preparing your report</h3>
        <p style={styles.muted}>OpenRouter is reviewing your inputs. You can cancel this request.</p>
      </section>
    );
  }
  if (error) {
    return (
      <div style={styles.alert} role="alert">
        <strong>Report generation failed.</strong>
        <p style={styles.paragraph}>{String(error)}</p>
        {onRetry && <button type="button" style={styles.button} onClick={onRetry}>Retry</button>}
      </div>
    );
  }
  if (value === null || value === undefined) return null;

  const pretty = JSON.stringify(value, null, 2);
  const text = jsonReportText(value);
  const actualModel = model || (isPlainObject(data) && (data.model || data.model_used));

  async function copy() {
    try {
      await navigator.clipboard.writeText(view === 'json' ? pretty : text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  function download() {
    const blob = new Blob([view === 'json' ? pretty : `${title}\n\n${text}\n`], { type: view === 'json' ? 'application/json' : 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.${view === 'json' ? 'json' : 'txt'}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <article style={styles.container} aria-label={`${title} report`}>
      <header style={styles.header}>
        <div>
          <span style={styles.eyebrow}>OpenRouter response · review before use</span>
          <h3 style={styles.title}>{title}</h3>
        </div>
        <div style={styles.actions}>
          <div style={styles.tabGroup} role="tablist" aria-label="Report view">
            <button type="button" role="tab" aria-selected={view === 'report'} style={view === 'report' ? styles.tabActive : styles.tab} onClick={() => setView('report')}>Report</button>
            <button type="button" role="tab" aria-selected={view === 'json'} style={view === 'json' ? styles.tabActive : styles.tab} onClick={() => setView('json')}>JSON</button>
          </div>
          <button type="button" style={styles.button} onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
          <button type="button" style={styles.button} onClick={download}>Download</button>
        </div>
      </header>
      <div style={styles.body}>
        {view === 'report' ? <Value value={value} /> : <pre style={styles.jsonView}><JsonNode name={undefined} value={value} /></pre>}
      </div>
      {(actualModel || tokens) && (
        <footer style={styles.footer}>
          {actualModel && <span>Model: {actualModel}</span>}
          {tokens && <span>{typeof tokens === 'number' ? tokens : tokens.total_tokens || ((tokens.prompt_tokens || 0) + (tokens.completion_tokens || 0))} tokens</span>}
        </footer>
      )}
    </article>
  );
}

const styles = {
  container: { border: '1px solid #dbe3ee', borderRadius: '14px', background: '#fff', overflow: 'hidden', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#16243a' },
  header: { display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-start', justifyContent: 'space-between', padding: '18px 20px', background: 'linear-gradient(120deg,#f2f6fc,#fbfdff)', borderBottom: '1px solid #e4ebf4' },
  eyebrow: { fontSize: '10px', fontWeight: 700, letterSpacing: '.16em', textTransform: 'uppercase', color: '#4b6b96' },
  title: { margin: '6px 0 0', fontSize: '20px', fontWeight: 700 },
  actions: { display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' },
  tabGroup: { display: 'inline-flex', border: '1px solid #cdd9e8', borderRadius: '9px', overflow: 'hidden' },
  tab: { border: 0, background: '#fff', padding: '7px 12px', fontSize: '12px', fontWeight: 600, color: '#42566f', cursor: 'pointer' },
  tabActive: { border: 0, background: '#255e49', padding: '7px 12px', fontSize: '12px', fontWeight: 700, color: '#fff', cursor: 'pointer' },
  button: { border: '1px solid #cdd9e8', background: '#fff', borderRadius: '9px', padding: '7px 12px', fontSize: '12px', fontWeight: 600, color: '#25364d', cursor: 'pointer' },
  body: { padding: '20px' },
  sections: { display: 'grid', gap: '16px' },
  section: { border: '1px solid #e4ebf4', borderRadius: '12px', padding: '14px 16px', background: '#fbfdff' },
  sectionTitle: { margin: '0 0 10px', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: '#33507a' },
  facts: { display: 'grid', gap: '1px', margin: 0, background: '#e4ebf4', border: '1px solid #e4ebf4', borderRadius: '12px', overflow: 'hidden' },
  factRow: { display: 'grid', gridTemplateColumns: 'minmax(150px, 34%) 1fr', gap: '16px', padding: '11px 14px', background: '#fff' },
  factKey: { fontWeight: 650, color: '#243a5e', fontSize: '13px' },
  factValue: { margin: 0, overflowWrap: 'anywhere', fontSize: '13.5px', color: '#1d2c44' },
  tableWrap: { overflowX: 'auto', border: '1px solid #e4ebf4', borderRadius: '12px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: { textAlign: 'left', padding: '10px 12px', background: '#f2f6fc', borderBottom: '1px solid #e4ebf4', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.05em', color: '#42608c', whiteSpace: 'nowrap' },
  td: { padding: '10px 12px', borderBottom: '1px solid #eef3f9', verticalAlign: 'top' },
  trAlt: { background: '#fafcff' },
  list: { margin: 0, paddingLeft: '20px', display: 'grid', gap: '6px' },
  listItem: { fontSize: '13.5px' },
  prose: { display: 'grid', gap: '6px' },
  paragraph: { margin: 0, lineHeight: 1.65, fontSize: '13.5px' },
  text: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  code: { background: '#eef3f9', borderRadius: '5px', padding: '1px 5px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '.9em' },
  number: { fontVariantNumeric: 'tabular-nums', fontWeight: 600 },
  muted: { color: '#6b7d94', fontSize: '13px' },
  badgeYes: { display: 'inline-block', background: '#e4f4e9', color: '#216e3e', borderRadius: '20px', padding: '2px 10px', fontSize: '12px', fontWeight: 700 },
  badgeNo: { display: 'inline-block', background: '#f1f3f6', color: '#64748b', borderRadius: '20px', padding: '2px 10px', fontSize: '12px', fontWeight: 700 },
  jsonView: { margin: 0, background: '#0f1b2d', color: '#d6e2f5', borderRadius: '12px', padding: '16px', overflow: 'auto', maxHeight: '640px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '12.5px', lineHeight: 1.6 },
  jsonLine: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  jsonKey: { color: '#7fb2ff' },
  jsonString: { color: '#9ae6b4' },
  jsonNumber: { color: '#f6c177' },
  jsonBoolean: { color: '#f78ca0' },
  jsonNull: { color: '#94a3b8', fontStyle: 'italic' },
  jsonText: { color: '#d6e2f5' },
  jsonPunct: { color: '#8ea3bf' },
  jsonEllipsis: { color: '#64748b' },
  jsonToggle: { display: 'inline-block', width: '14px', color: '#8ea3bf' },
  footer: { display: 'flex', gap: '16px', flexWrap: 'wrap', padding: '12px 20px', borderTop: '1px solid #e4ebf4', fontSize: '12px', color: '#5b6f8a' },
  loadingDot: { width: '10px', height: '10px', borderRadius: '50%', background: '#255e49', marginBottom: '10px' },
  alert: { border: '1px solid #f2c9b8', background: '#fff3ec', color: '#8f3d20', borderRadius: '12px', padding: '14px 16px' },
};
