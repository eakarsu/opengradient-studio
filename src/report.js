const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export function downloadReport({ title, subtitle, html, reference }) {
  const document = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>body{font-family:system-ui,sans-serif;color:#26322f;max-width:860px;margin:64px auto;padding:0 28px;line-height:1.8}header{border-bottom:2px solid #e97249;padding-bottom:24px;margin-bottom:36px}header small{color:#75827d;text-transform:uppercase;letter-spacing:2px}h1,h2,h3{line-height:1.4}h2,h3{margin-top:32px}table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #dfe5e2;padding:12px;text-align:left}th{background:#f3f7f5}pre{padding:20px;background:#f3f5f4;overflow:auto;white-space:pre-wrap}blockquote{border-left:3px solid #e97249;margin-left:0;padding-left:20px}a{color:#9e4c2f}footer{margin-top:48px;border-top:1px solid #dfe5e2;padding-top:20px;font-size:12px;color:#75827d}@media print{body{margin:20px auto}table,pre{break-inside:avoid}}</style></head><body><header><small>OpenGradient Studio</small><h1>${escape(title)}</h1><p>${escape(subtitle)}</p></header><article>${html || ''}</article><footer>${escape(reference)}</footer></body></html>`;
  const url = URL.createObjectURL(new Blob([document], { type: 'text/html;charset=utf-8' }));
  const link = window.document.createElement('a');
  link.href = url; link.download = 'opengradient-execution-report.html'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
