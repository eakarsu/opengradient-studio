export async function api(path, options = {}) {
  const multipart = options.body instanceof FormData;
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { ...(options.body && !multipart ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    body: multipart ? options.body : options.body ? JSON.stringify(options.body) : undefined,
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({ error: 'The server returned an unreadable response. Refresh the app and try again.' }));
  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong. Please try again.');
    error.fields = data.fields || {};
    error.status = response.status;
    throw error;
  }
  return data;
}

export const number = value => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value) || 0);
export const compact = value => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value) || 0);
export const short = (value, length = 7) => value ? `${value.slice(0, length)}…${value.slice(-5)}` : '—';
export const date = value => new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export const initials = value => value.split(/[\s-]+/).map(word => word[0]).slice(0, 2).join('').toUpperCase();
