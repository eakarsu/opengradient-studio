const esc = (v) => {
  if (v === null || v === undefined) return '';
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function recordsToCsv(rows, fields) {
  const keys = fields.map((f) => (typeof f === 'string' ? f : f.key));
  const labels = fields.map((f) => (typeof f === 'string' ? f : f.label || f.key));
  return [labels.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n') + '\n';
}

export function recordsToJson(rows) {
  return JSON.stringify({ exportedAt: new Date().toISOString(), records: rows }, null, 2);
}
