import { useState } from 'react';
import { api } from '../api';
import { Modal, Icon } from './ui';

export default function AISettings({ settings, onClose, onSaved, notify }) {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(settings?.default_model || 'openrouter/free');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const updated = await api('/ai/settings', { method: 'PUT', body: { model, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) } });
      onSaved(updated); notify(updated.configured ? 'OpenRouter connected. Your AI tools are ready.' : 'Default AI model saved. Add a key to connect OpenRouter.'); onClose();
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  return <Modal title="AI settings" className="ai-settings-modal" onClose={onClose} busy={busy}>
    <header className="modal-header"><div className="modal-heading"><span className="ai-icon"><Icon name="Sparkles" size={24}/></span><div><div className="eyebrow">YOUR AI CONNECTION</div><h2>Connect OpenRouter</h2></div></div><button className="icon-button" aria-label="Close AI settings" disabled={busy} onClick={onClose}><Icon name="X" size={20}/></button></header>
    <form id="ai-settings-form" className="ai-settings-body" onSubmit={save}>
      <p>One connection powers all 24 AI tools. Start with the free model router or choose an OpenRouter model of your own.</p>
      <div className={`ai-connection ${settings?.configured ? 'connected' : ''}`}><Icon name={settings?.configured ? 'CircleCheck' : 'LockKeyhole'} size={18}/><div><strong>{settings?.configured ? 'API key is configured' : 'Add your OpenRouter API key'}</strong><span>{settings?.configured ? `Loaded from ${settings.key_source === 'environment' ? 'your environment' : 'this computer'}. Enter a new key only to replace it.` : 'Your key stays on the local server and is never returned to the browser.'}</span></div></div>
      <label className="ai-field"><span>OpenRouter API key</span><input type="password" aria-label="OpenRouter API key" autoComplete="new-password" spellCheck={false} value={apiKey} required={!settings?.configured} disabled={busy} placeholder={settings?.configured ? 'Leave blank to keep the current key' : 'sk-or-v1-…'} onChange={event => setApiKey(event.target.value)}/></label>
      <label className="ai-field"><span>Default model</span><input aria-label="Default AI model" value={model} required disabled={busy} placeholder="openrouter/free" onChange={event => setModel(event.target.value)}/><small>openrouter/free selects an available free text model. You can choose a different model in each tool.</small></label>
      <a href="https://openrouter.ai/settings/keys" className="ai-key-link" target="_blank" rel="noopener noreferrer">Get an OpenRouter API key<Icon name="ArrowUpRight" size={14}/></a>
      {error && <div className="ai-error" role="alert"><Icon name="CircleAlert" size={17}/>{error}</div>}
    </form>
    <footer className="modal-footer"><span className="ai-secure-note"><Icon name="LockKeyhole" size={13}/>Stored on this computer</span><div className="modal-footer-actions"><button className="button secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="button primary" form="ai-settings-form" type="submit" disabled={busy}>{busy ? 'Checking connection…' : 'Save connection'}<Icon name="ArrowRight" size={15}/></button></div></footer>
  </Modal>;
}
