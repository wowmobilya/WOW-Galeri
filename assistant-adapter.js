/* Business data stays on this device. One transaction validates and commits each approved plan. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.WOWAssistantAdapter = factory(root.WOWAssistantCore, {
    getDB: async () => { if (!db) await initDB();return db; }, getState: () => S,
    locked: () => !!window.WF_RESTORE_WRITE_LOCK || (typeof WF_RESTORE_PENDING !== 'undefined' && (WF_RESTORE_PENDING.busy || WF_RESTORE_PENDING.complete)),
    refresh: async () => {
      const rows = await Promise.all(['companies', 'products', 'invoices', 'payments'].map(dbGetAll));
      [S.companies, S.products, S.invoices, S.payments] = rows;
      Object.assign(S.settings, await dbGet('settings', 'main') || {});
      // Rendering cannot suppress backup notification after state has been hydrated.
      try {
        updateDash();updateInvNumDisplay();
        const page = getCurrentPage();
        if (page === 'companies') renderCo();
        if (page === 'products') renderPr();
        if (page === 'invoices') { renderInvList();updateInvClientFilterBar(); }
      } catch (_) { return { refreshRequired: true }; }
    },
    notify: stores => wfDriveOnDatabaseCommit(stores),
    native: async action => {
      if (action.action === 'set_language') { setLang(action.value);return { action: action.action, value: action.value }; }
      if (action.action === 'set_theme') { if (S.theme !== action.value) toggleTheme();return { action: action.action, value: action.value }; }
      if (action.action === 'payments') return openPaymentMgmt(action.id);
      if (action.action === 'preview_invoice') return previewSaved(action.id);
      if (action.action === 'export_pdf') return downloadSavedPDF(action.id);
      if (action.action === 'export_excel') return downloadSavedExcel(action.id);
      const page = action.page;
      if (['backup', 'restore', 'settings', 'currency', 'language', 'theme'].includes(page)) {
        openSettingsPage();
        if (page === 'backup' || page === 'restore') switchTab('data');
        if (page === 'currency') switchTab('currency');
        return;
      }
      if (page === 'print-settings') return openPrintOptionsModal('general');
      const mapped = { payments: 'payment-management', barcode: 'quick-barcode', 'add-company': 'select-client-type', 'create-invoice': 'select-invoice-type' };
      if (!root.WOWAssistantCore.pages.includes(page)) throw new Error('action_unsupported');
      return showPage(mapped[page] || page);
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Core, env) {
  'use strict';
  const stores = ['companies', 'products', 'invoices', 'payments', 'settings'];
  const copy = x => JSON.parse(JSON.stringify(x));
  function inspect(rows) {
    const state = env.getState(), settings = { ...state.settings, ...(rows.settings.find(r => r.id === 'main') || {}) };
    const rates = { usdTry: Number(settings.manualUsdTry || state.usdTry), usdEur: Number(settings.manualUsdEur || state.usdEur) };
    const now = new Date(), today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    return { ...rows, settings, rates, today, lang: state.lang, printLang: state.printLang, printOpts: copy(state.printOpts || {}), revision: JSON.stringify([rows, rates]) };
  }
  function readTransaction(database, mode, act) {
    return new Promise((resolve, reject) => {
      let tx, value, failure;
      try {
        tx = database.transaction(stores, mode);
        tx.oncomplete = () => resolve(value);
        tx.onabort = tx.onerror = () => reject(failure || tx.error || new Error('database_failed'));
        const rows = {};let remaining = stores.length;
        stores.forEach(name => {
          const req = tx.objectStore(name).getAll();
          req.onsuccess = () => {
            rows[name] = req.result || [];
            if (--remaining) return;
            try { value = act(rows, tx); } catch (e) { failure = e;tx.abort(); }
          };
        });
      } catch (e) { if (tx) try { tx.abort(); } catch (_) {}reject(e); }
    });
  }
  async function snapshot() { return readTransaction(await env.getDB(), 'readonly', inspect); }
  async function preview(command, selections = {}) {
    const s = await snapshot(), plan = Core.compile(command, s, selections);
    plan.selections = copy(selections);return { plan, snapshot: s };
  }
  function materialize(value, operationId) {
    if (Array.isArray(value)) return value.map(v => materialize(v, operationId));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, materialize(v, operationId)]));
    if (value === '__NEW__') return 'ai_' + operationId;
    if (value === '__PAYMENT__') return 'ai_payment_' + operationId;
    return value;
  }
  async function after(result) {
    try { const state = await env.refresh();if (state?.refreshRequired) result.refreshRequired = true;env.notify(stores); }
    catch (_) { result.refreshRequired = true; }
    return result;
  }
  async function commit(plan, operationId, approval = {}) {
    if (approval.confirmed !== true) throw new Error('confirmation_required');
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(operationId || '')) throw new Error('operation_invalid');
    if (env.locked()) throw new Error('restore_busy');
    const database = await env.getDB();
    const result = await readTransaction(database, 'readwrite', (rows, tx) => {
      if (env.locked()) throw new Error('restore_busy');
      const main = rows.settings.find(r => r.id === 'main') || { id: 'main' };
      const done = (main.assistantOperations || []).find(r => r.id === operationId);
      if (done) return { ...done, duplicate: true };
      const current = inspect(rows);
      if (plan.revision !== current.revision) throw new Error('stale_preview');
      const fresh = Core.compile(plan.command, current, plan.selections || {});
      if (fresh.status !== 'ready' || (!fresh.writes.length && !fresh.deletes.length)) throw new Error(fresh.error || 'preview_required');
      if (fresh.destructive && approval.deleteConfirmed !== true) throw new Error('delete_confirmation_required');
      const audit = { id: operationId, intent: fresh.intent, at: new Date().toISOString(), store: fresh.store, recordId: materialize(fresh.record?.id, operationId) };
      fresh.writes.forEach(w => tx.objectStore(w.store).put(materialize(w.value, operationId)));
      fresh.deletes.forEach(w => tx.objectStore(w.store).delete(w.id));
      let memory = main.assistantMemory || { version: 1, aliases: [] };
      fresh.memoryUpdates.forEach(m => { memory = Core.remember(memory, m.kind, m.alias, m.id); });
      tx.objectStore('settings').put({ ...main, ...fresh.settingsPatch, id: 'main', assistantMemory: memory, assistantOperations: [...(main.assistantOperations || []).slice(-99), audit] });
      return audit;
    });
    return after(result);
  }
  async function memory(value) {
    const validated = Core.validateMemory(value);
    if (env.locked()) throw new Error('restore_busy');
    await readTransaction(await env.getDB(), 'readwrite', (rows, tx) => {
      if (env.locked()) throw new Error('restore_busy');
      const main = rows.settings.find(r => r.id === 'main') || { id: 'main' };
      tx.objectStore('settings').put({ ...main, assistantMemory: validated });
    });
    return after({ saved: true });
  }
  async function teaching(value) {
    const D = typeof module === 'object' && module.exports ? require('./assistant-dialogue.js') : globalThis.WOWAssistantDialogue;
    const validated = value === null ? null : D.validateTeaching(value);
    if (env.locked()) throw new Error('restore_busy');
    await readTransaction(await env.getDB(), 'readwrite', (rows, tx) => {
      if (env.locked()) throw new Error('restore_busy');
      const main = { ...(rows.settings.find(r => r.id === 'main') || { id: 'main' }) };
      if (validated === null) delete main.assistantTeaching;else main.assistantTeaching = validated;
      tx.objectStore('settings').put(main);
    });
    // Do not let a hydrated UI override resurrect a deleted teaching file.
    if (validated === null) delete env.getState().settings.assistantTeaching;
    else env.getState().settings.assistantTeaching = copy(validated);
    return after({ saved: true });
  }
  async function native(action) {
    if (env.locked()) throw new Error('restore_busy');
    if (!action || !['open', 'payments', 'preview_invoice', 'export_pdf', 'export_excel', 'set_language', 'set_theme'].includes(action.action)) throw new Error('action_unsupported');
    if (action.action === 'open' && !Core.pages.includes(action.page)) throw new Error('action_unsupported');
    if (action.action === 'set_language' && !['ar', 'tr', 'en'].includes(action.value)) throw new Error('action_unsupported');
    if (action.action === 'set_theme' && !['light', 'dark'].includes(action.value)) throw new Error('action_unsupported');
    if (!['open', 'set_language', 'set_theme'].includes(action.action)) { const s = await snapshot();if (!s.invoices.some(i => String(i.id) === String(action.id))) throw new Error('record_missing'); }
    return env.native(action);
  }
  return { snapshot, preview, commit, memory, teaching, native };
});
