import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

export default function TasksPanel({ notify }) {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState('');
  const load = useCallback(async () => {
    try { setTasks((await api('/tasks')).tasks || []); } catch (e) { notify(e.message, 'error'); }
  }, [notify]);
  useEffect(() => { load(); }, [load]);
  async function create(e) {
    e.preventDefault();
    try { await api('/tasks', { method: 'POST', body: { name: title } }); setTitle(''); load(); } catch (err) { notify(err.message, 'error'); }
  }
  async function toggle(task) {
    try { await api(`/tasks/${task.id}`, { method: 'PATCH', body: { status: task.status === 'Done' ? 'Open' : 'Done' } }); load(); } catch (err) { notify(err.message, 'error'); }
  }
  return (
    <div className="collection-page">
      <div className="page-heading"><div><div className="eyebrow">YOUR WORKSPACE</div><h1>Tasks</h1><p>Track follow-up work across models, inferences, and proofs.</p></div></div>
      <form onSubmit={create}><label>New task <input value={title} onChange={(e) => setTitle(e.target.value)} required /></label><button className="button primary" type="submit">Add task</button></form>
      <ul>{tasks.map((t) => (<li key={t.id}>{t.name} — {t.status} ({t.priority}) <button type="button" onClick={() => toggle(t)}>{t.status === 'Done' ? 'Reopen' : 'Done'}</button></li>))}</ul>
      {!tasks.length && <p>No tasks yet.</p>}
    </div>
  );
}
