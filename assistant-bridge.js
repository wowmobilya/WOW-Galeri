(function (root) {
  'use strict';
  const origin = 'https://wow-background-backup-iay1ii.v2.appdeploy.ai';
  const allowed = new Set(['/api/assistant/plan', '/api/assistant/connect']);
  const pending = new Map();let frame, boot, resolveBoot, bootTimer;
  const storage = { get(key) { try { return localStorage.getItem(key) || ''; } catch (_) { return ''; } }, set(key, value) { localStorage.setItem(key, String(value)); }, remove(key) { try { localStorage.removeItem(key); } catch (_) {} } };
  function id() { return crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join(''); }
  function key() { let v = storage.get('wf_ai_device_key_v1');if (!v) { v = id().replace(/-/g, '');storage.set('wf_ai_device_key_v1', v); }return v; }
  function credentials() {
    const sessionId = storage.get('wf_ai_session_id_v1');
    if (sessionId && Number(storage.get('wf_ai_expires_v1')) > Date.now()) return { sessionId, deviceKey: key() };
    const recordId = storage.get('wf_bg_record_id_v2'), deviceKey = storage.get('wf_bg_device_key_v2');
    if (recordId && deviceKey && storage.get('wf_bg_paired_v2') === '1' && !storage.get('wf_bg_disconnect_pending_v21')) return { recordId, deviceKey };
    return null;
  }
  root.addEventListener('message', event => {
    if (event.origin !== origin || event.source !== frame?.contentWindow) return;
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'WOW_BG_BRIDGE_READY') { clearTimeout(bootTimer);resolveBoot?.();return; }
    if (msg.type !== 'WOW_BG_BRIDGE_RESPONSE' || typeof msg.id !== 'string') return;
    const p = pending.get(msg.id);if (!p) return;
    pending.delete(msg.id);clearTimeout(p.timer);p.cleanup?.();
    if (msg.ok && msg.data?.ok) p.resolve(msg.data);else p.reject(new Error(msg.data?.error || 'assistant_unavailable'));
  });
  function ready() {
    if (boot) return boot;
    boot = new Promise((resolve, reject) => {
      resolveBoot = resolve;frame = document.createElement('iframe');frame.hidden = true;frame.title = 'WOW assistant connection';frame.src = origin + '/?bridge=1';
      bootTimer = setTimeout(() => { frame?.remove();frame = null;boot = null;reject(new Error('assistant_unavailable')); }, 15000);
      document.body.append(frame);
    });return boot;
  }
  function abortable(promise, signal) {
    if (!signal) return promise;
    return new Promise((resolve, reject) => {
      const abort = () => { cleanup();reject(new Error('request_cancelled')); };
      const cleanup = () => signal.removeEventListener('abort', abort);
      if (signal.aborted) { abort();return; }
      signal.addEventListener('abort', abort, { once: true });
      promise.then(value => { cleanup();resolve(value); }, error => { cleanup();reject(error); });
    });
  }
  async function request(path, body, options = {}) {
    if (!allowed.has(path)) throw new Error('action_unsupported');
    if (navigator.onLine === false) throw new Error('offline');
    const signal = options.signal;
    if (signal?.aborted) throw new Error('request_cancelled');
    await abortable(ready(), signal);
    if (signal?.aborted) throw new Error('request_cancelled');
    return new Promise((resolve, reject) => {
      const requestId = 'ai-' + id();
      const cleanup = () => signal?.removeEventListener('abort', abort);
      const abort = () => { pending.delete(requestId);clearTimeout(timer);cleanup();reject(new Error('request_cancelled')); };
      const timer = setTimeout(() => { pending.delete(requestId);cleanup();reject(new Error('assistant_timeout')); }, 65000);
      pending.set(requestId, { resolve, reject, timer, cleanup });
      signal?.addEventListener('abort', abort, { once: true });
      try { frame.contentWindow.postMessage({ type: 'WOW_BG_BRIDGE_REQUEST', id: requestId, method: 'POST', path, body }, origin); }
      catch (error) { pending.delete(requestId);clearTimeout(timer);cleanup();reject(error); }
    });
  }
  function connect() {
    if (!root.google?.accounts?.oauth2 || !root.WOW_GOOGLE_DRIVE_CLIENT_ID) return Promise.reject(new Error('google_not_ready'));
    const deviceKey = key();
    // Called directly in a click handler to preserve Google's user-gesture requirement.
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('connection_timeout')), 180000);
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: root.WOW_GOOGLE_DRIVE_CLIENT_ID, scope: 'openid email', include_granted_scopes: false,
        error_callback: () => { clearTimeout(timer);reject(new Error('connection_cancelled')); },
        callback: async result => {
          clearTimeout(timer);
          if (result.error || !result.access_token) { reject(new Error('connection_cancelled'));return; }
          try {
            const response = await request('/api/assistant/connect', { accessToken: result.access_token, deviceKey });
            storage.set('wf_ai_session_id_v1', response.sessionId);storage.set('wf_ai_expires_v1', response.expiresAt);resolve(response);
          } catch (e) { reject(e); }
        }
      });tokenClient.requestAccessToken({ prompt: 'select_account' });
    });
  }
  async function plan(payload, options = {}) { const auth = credentials();if (!auth) throw new Error('assistant_auth_required');return request('/api/assistant/plan', { ...payload, ...auth }, options); }
  root.WOWAssistantBridge = { credentials, connect, plan, id };
})(window);
