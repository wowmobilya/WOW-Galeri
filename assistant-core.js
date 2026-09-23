/* WOW Assistant: deterministic planning. Model output cannot execute code or write data. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WOWAssistantCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const kinds = { client: 'companies', product: 'products', invoice: 'invoices', payment: 'payments' };
  const intents = ['create_invoice', 'update_invoice', 'add_payment', 'create_client', 'update_client', 'create_product', 'update_product', 'delete_record', 'search', 'account_statement', 'dashboard_summary', 'open_page', 'preview_invoice', 'export_pdf', 'export_excel', 'share_pdf', 'share_excel', 'print_invoice', 'backup', 'help'];
  const pages = ['dashboard', 'companies', 'products', 'invoices', 'add-company', 'add-product', 'create-invoice', 'payments', 'settings', 'print-settings', 'backup', 'restore', 'barcode', 'currency', 'language', 'theme'];
  const types = ['coffee_table', 'dresser', 'side_table', 'tv_table', 'other'];
  const currencies = ['USD', 'EUR', 'TRY'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const present = value => value !== undefined && value !== null && value !== '';
  const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
  function normalize(value) {
    return String(value || '').replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632))
      .replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776)).normalize('NFKD').toLowerCase()
      .replace(/[\u0300-\u036f\u064b-\u065f\u0670ـ]/g, '').replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ı/g, 'i').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
  }
  function number(value) {
    if (typeof value === 'number') return value;
    let s = String(value ?? '').trim().replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776)).replace(/٬/g, '').replace(/٫/g, '.').replace(/\s/g, '');
    if (/^[+-]?\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
    else if (/^[+-]?\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
    // A bare 1.000/1,000 is locale-ambiguous: typed forms display their numeric value before confirmation.
    return /^[+-]?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
  }
  function validateMemory(value) {
    if (!value || typeof value !== 'object' || (value.version !== undefined && value.version !== 1) || !Array.isArray(value.aliases) || value.aliases.length > 1000) throw new Error('memory_invalid');
    const aliases = value.aliases.map(row => {
      if (!row || !Object.hasOwn(kinds, row.kind) || typeof row.alias !== 'string' || !normalize(row.alias) || row.alias.length > 160 || !['string', 'number'].includes(typeof row.id) || String(row.id).length > 160) throw new Error('memory_invalid');
      return { kind: row.kind, alias: row.alias.trim(), id: row.id, updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt.slice(0, 40) : '' };
    });
    return { version: 1, aliases };
  }
  function remember(memory, kind, alias, id) {
    const base = validateMemory({ version: 1, aliases: memory?.aliases || [] });
    const row = validateMemory({ version: 1, aliases: [{ kind, alias, id }] }).aliases[0];
    base.aliases = base.aliases.filter(a => !(a.kind === kind && normalize(a.alias) === normalize(alias)));
    row.updatedAt = new Date().toISOString();base.aliases.push(row);base.aliases = base.aliases.slice(-1000);return base;
  }
  function distance(a, b) {
    if (a.length > 160 || b.length > 160) return 160;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) { const next = [i];for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, prev[j] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));prev = next; }return prev[b.length];
  }
  function label(row, kind) { return kind === 'invoice' ? `${row.invNo || ''} · ${row.companyName || ''}` : kind === 'payment' ? `${row.date || ''} · ${row.amount || 0} USD · ${row.note || ''}` : row.name || row.buyerName || String(row.id); }
  function resolve(query, records, kind, memory = {}) {
    const q = normalize(query), list = records || [], aliases = (memory.aliases || []).filter(a => a.kind === kind && normalize(a.alias) === q);
    const exact = list.filter(r => q && [r.name, r.invNo, r.barcode, String(r.id)].some(v => normalize(v) === q));
    if (exact.length === 1) return { id: exact[0].id, record: exact[0], options: [] };
    const learned = list.filter(r => aliases.some(a => String(a.id) === String(r.id)));
    if (!exact.length && learned.length === 1) return { id: learned[0].id, record: learned[0], options: [], learned: true };
    const scored = list.map(row => {
      const name = normalize(label(row, kind));
      const score = !q ? .1 : name.includes(q) || q.includes(name) ? .85 : 1 - distance(q, name) / Math.max(q.length, name.length, 1);
      return { id: row.id, label: label(row, kind), score, type: row.type || '', info: row.country || row.city || '' };
    }).filter(r => !q || r.score >= .45 || exact.some(e => e.id === r.id)).sort((a, b) => b.score - a.score).slice(0, 40);
    return { id: null, options: scored };
  }
  function paid(invoice, snapshot) {
    const rows = (snapshot.payments || []).filter(p => String(p.invoiceId) === String(invoice.id));
    return round(Number(invoice.depositUSD || 0) + rows.reduce((n, p) => n + Number(p.amount || 0), 0));
  }
  function summarize(snapshot, clientId) {
    const invoices = (snapshot.invoices || []).filter(i => clientId === undefined || String(i.companyId) === String(clientId));
    const invoicedUSD = round(invoices.reduce((n, i) => n + Number(i.grandTotal || 0), 0));
    const paidUSD = round(invoices.reduce((n, i) => n + paid(i, snapshot), 0));
    return { count: invoices.length, invoicedUSD, paidUSD, balanceUSD: round(invoicedUSD - paidUSD), invoices: invoices.map(i => ({ id: i.id, invNo: i.invNo, companyName: i.companyName, totalUSD: i.grandTotal || 0, paidUSD: paid(i, snapshot), remainingUSD: round(Number(i.grandTotal || 0) - paid(i, snapshot)), date: i.regDate || i.createdAt || '', delivered: !!i.delivered })) };
  }
  function compile(command, snapshot, selections = {}) {
    const c = clone(command || {}), s = snapshot, questions = [], warnings = [];
    const plan = { status: 'ready', intent: c.intent, command: c, questions, warnings, writes: [], deletes: [], revision: s.revision, destructive: false, memoryUpdates: [] };
    const ask = (key, type, extra = {}) => questions.push({ key, type, ...extra });
    const fail = (code, field = '') => { const error = new Error(code);error.field = field;throw error; };
    const pick = (kind, query, key, optional = false) => {
      const records = s[kinds[kind]] || [], selected = selections[key];
      if (present(selected)) {
        const record = records.find(r => String(r.id) === String(selected));
        if (!record) fail('record_missing', key);
        if (query) plan.memoryUpdates.push({ kind, alias: String(query).slice(0, 160), id: record.id });
        return record;
      }
      if (optional && !query) return null;
      const found = resolve(query, records, kind, s.settings?.assistantMemory || {});
      if (found.record) return found.record;
      ask(key, 'record', { kind, query: query || '', options: found.options });return null;
    };
    const amount = (value, field, { positive = false, max = 1e12 } = {}) => {
      const n = number(value);
      if (!Number.isFinite(n) || n < 0 || (positive && n <= 0) || n > max) fail('amount_invalid', field);return n;
    };
    const toUSD = (value, currency, field) => {
      const n = amount(value, field);
      if (!currencies.includes(currency)) fail('currency_invalid', field);
      const rate = currency === 'USD' ? 1 : Number(s.rates?.[currency === 'TRY' ? 'usdTry' : 'usdEur']);
      if (!Number.isFinite(rate) || rate <= 0) fail('rate_invalid', field);return round(n / rate);
    };
    const text = (value, field, max = 2000) => {
      if (typeof value !== 'string' || value.length > max) fail('text_invalid', field);
      // Legacy native screens interpolate text in HTML. Contain newly generated text here.
      if (/[<>"`\u0000-\u0008]|(?:javascript|vbscript|data)\s*:/i.test(value)) fail('text_unsafe', field);
      return value.trim();
    };
    const date = (value, field) => {
      if (!value) return '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail('date_invalid', field);return value;
    };
    const recordWrite = (store, record) => { plan.record = record;plan.store = store;plan.writes.push({ store, value: record }); };
    const finish = () => { if (questions.length) { plan.status = 'clarify';plan.writes = [];plan.deletes = []; }return plan; };
    try {
      if (!intents.includes(c.intent)) { ask('intent', 'choice', { options: intents.map(id => ({ id, label: id })) });return finish(); }
      if (present(c.paymentMethod) && !['cash', 'bank_transfer', 'credit_card', 'check', 'installment', 'western_union', 'crypto', 'paypal', 'letter_credit', 'deferred'].includes(c.paymentMethod)) fail('type_invalid', 'paymentMethod');
      if (c.intent === 'help') { plan.status = 'read';plan.result = { type: 'help', intents, pages };return plan; }
      if (c.intent === 'dashboard_summary') { plan.status = 'read';plan.result = { type: 'summary', ...summarize(s), clients: s.companies.length, products: s.products.length };return plan; }
      if (c.intent === 'account_statement') {
        const client = pick('client', c.clientQuery || c.query, 'client');if (!client) return finish();
        plan.status = 'read';plan.result = { type: 'statement', client, ...summarize(s, client.id) };return plan;
      }
      if (c.intent === 'search') {
        const kind = Object.hasOwn(kinds, c.target) ? c.target : 'product';const result = resolve(c.query || c.productQuery || c.clientQuery || c.invoiceQuery, s[kinds[kind]], kind, s.settings?.assistantMemory);
        plan.status = 'read';plan.result = { type: 'search', kind, records: result.record ? [result.record] : result.options.map(r => s[kinds[kind]].find(x => x.id === r.id)) };return plan;
      }
      if (c.intent === 'open_page' || c.intent === 'backup') {
        const page = c.intent === 'backup' ? (c.page === 'restore' ? 'restore' : 'backup') : c.page;
        if (page === 'payments') {
          const inv = pick('invoice', c.invoiceQuery || c.query, 'invoice');if (!inv) return finish();
          plan.status = 'native';plan.native = { action: 'payments', id: inv.id };return plan;
        }
        if (!pages.includes(page)) ask('page', 'choice', { options: pages.map(id => ({ id, label: id })) });
        else { plan.status = 'native';plan.native = { action: 'open', page }; }return finish();
      }
      if (['preview_invoice', 'export_pdf', 'export_excel', 'share_pdf', 'share_excel', 'print_invoice'].includes(c.intent)) {
        const inv = pick('invoice', c.invoiceQuery || c.query, 'invoice');if (!inv) return finish();
        plan.status = 'native';plan.native = { action: c.intent, id: inv.id };return plan;
      }
      if (c.intent === 'delete_record') {
        if (!Object.hasOwn(kinds, c.target)) { ask('target', 'choice', { options: Object.keys(kinds).map(id => ({ id, label: id })) });return finish(); }
        const row = pick(c.target, c.query || c.clientQuery || c.productQuery || c.invoiceQuery, 'target');if (!row) return finish();
        if (c.target === 'client' && s.invoices.some(i => String(i.companyId) === String(row.id))) fail('client_has_invoices');
        if (c.target === 'product' && s.invoices.some(i => (i.items || []).some(p => String(p.productId) === String(row.id)))) fail('product_has_invoices');
        plan.destructive = true;plan.record = row;plan.store = kinds[c.target];plan.deletes.push({ store: plan.store, id: row.id });
        if (c.target === 'invoice') s.payments.filter(p => String(p.invoiceId) === String(row.id)).forEach(p => plan.deletes.push({ store: 'payments', id: p.id }));
        if (c.target === 'payment') {
          const inv = s.invoices.find(i => String(i.id) === String(row.invoiceId));if (!inv) fail('record_missing');
          const rest = s.payments.filter(p => p.id !== row.id && String(p.invoiceId) === String(inv.id));
          const total = round(Number(inv.depositUSD || 0) + rest.reduce((n, p) => n + Number(p.amount || 0), 0));
          plan.writes.push({ store: 'invoices', value: { ...clone(inv), payments: rest, totalPaidUSD: total, remainingUSD: round(Math.max(0, Number(inv.grandTotal || 0) - total)) } });
        }return plan;
      }
      if (c.intent.endsWith('_client') || c.intent.endsWith('_product')) {
        const kind = c.intent.endsWith('_client') ? 'client' : 'product', update = c.intent.startsWith('update_'), fields = c.fields || {};
        const old = update ? pick(kind, c.query || c[kind + 'Query'], kind) : null;if (update && !old) return finish();
        const allowed = kind === 'client' ? ['name', 'buyerName', 'country', 'province', 'city', 'phone', 'email', 'website', 'showrooms', 'type'] : ['name', 'type', 'price', 'priceA', 'priceB', 'priceC', 'color', 'desc', 'hsCode', 'weight', 'cbm', 'packets', 'dimensions'];
        for (const key of Object.keys(fields)) if (present(fields[key]) && !allowed.includes(key)) fail('field_unsupported', key);
        const rec = old ? clone(old) : kind === 'client' ? { type: 'external', buyerName: '', country: '', province: '', city: '', phone: '', email: '', website: '', showrooms: 0, logo: null } : { type: 'other', color: 'STANDARD', priceB: 0, priceC: 0, weight: 0, cbm: 0, packets: 1, image: null, dimPieces: [], dims: [] };
        rec.id = old?.id || '__NEW__';
        if (!old) rec.createdAt = new Date().toISOString();
        for (const key of allowed) if (fields[key] !== undefined && fields[key] !== null) {
          if (['price', 'priceA', 'priceB', 'priceC'].includes(key)) rec[key === 'price' ? 'priceA' : key] = toUSD(fields[key], c.currency || 'USD', 'fields.' + key);
          else if (['showrooms', 'weight', 'cbm', 'packets'].includes(key)) rec[key] = amount(fields[key], 'fields.' + key, { positive: key === 'packets' });
          else rec[key] = text(fields[key], 'fields.' + key, key === 'desc' ? 3000 : 250);
        }
        if (!rec.name?.trim()) ask('fields.name', 'text');
        if (rec.name && s[kinds[kind]].some(r => r.id !== old?.id && normalize(r.name) === normalize(rec.name))) fail('duplicate_name', 'fields.name');
        if (kind === 'client' && !['external', 'internal_retail', 'internal_wholesale'].includes(rec.type)) fail('type_invalid', 'fields.type');
        if (kind === 'product') {
          if (!types.includes(rec.type) && (!old || rec.type !== old.type)) fail('type_invalid', 'fields.type');
          if (!present(rec.priceA)) ask('fields.priceA', 'number');else amount(rec.priceA, 'fields.priceA', { positive: true });
          rec.priceUSD = rec.priceA;rec.priceTRY = round(rec.priceA * s.rates.usdTry);rec.totalCBM = rec.cbm;rec.totalWeight = rec.weight;rec.totalPackets = rec.packets;rec.barcode = rec.name?.toUpperCase() || '';
        }
        recordWrite(kinds[kind], rec);return finish();
      }
      if (c.intent === 'add_payment') {
        const inv = pick('invoice', c.invoiceQuery || c.query, 'invoice');
        if (!present(c.amount)) ask('amount', 'number');
        if (!inv || !present(c.amount)) return finish();
        if (c.clientQuery) { const co = pick('client', c.clientQuery, 'client');if (!co) return finish();if (String(co.id) !== String(inv.companyId)) fail('client_invoice_mismatch'); }
        const cur = c.amountCurrency || c.currency || inv.currency || 'USD';
        const usd = toUSD(c.amount, cur, 'amount');amount(usd, 'amount', { positive: true });
        const remaining = round(Number(inv.grandTotal || 0) - paid(inv, s));if (usd > remaining + .005) fail('overpayment', 'amount');
        const payment = { id: '__PAYMENT__', invoiceId: inv.id, amount: usd, currency: 'USD', originalAmount: number(c.amount), originalCurrency: cur, receiptType: c.paymentMethod || 'cash', date: date(c.date || s.today, 'date'), note: text(c.notes || '', 'notes'), createdAt: new Date().toISOString() };
        const totalPaid = round(paid(inv, s) + usd), updated = { ...clone(inv), payments: [...s.payments.filter(p => String(p.invoiceId) === String(inv.id)), payment], totalPaidUSD: totalPaid, remainingUSD: round(Number(inv.grandTotal || 0) - totalPaid) };
        plan.payment = payment;recordWrite('invoices', updated);plan.writes.push({ store: 'payments', value: payment });return plan;
      }
      const update = c.intent === 'update_invoice';
      const old = update ? pick('invoice', c.invoiceQuery || c.query, 'invoice') : null;if (update && !old) return finish();
      const co = c.clientQuery || !old ? pick('client', c.clientQuery, 'client') : s.companies.find(x => String(x.id) === String(old.companyId));
      if (!co) { if (old && !questions.length) fail('record_missing', 'client');return finish(); }
      if (old && String(co.id) !== String(old.companyId)) fail('client_change_use_native');
      const currency = c.currency || old?.currency || (co.type === 'external' ? 'USD' : 'TRY');if (!currencies.includes(currency)) fail('currency_invalid', 'currency');
      const tier = c.tier || old?.tier || 'A';if (!['A', 'B', 'C'].includes(tier)) fail('tier_invalid', 'tier');
      let items = old ? clone(old.items || []) : [];
      if (old && c.tier && c.tier !== old.tier) {
        items.forEach(item => {
          const product = s.products.find(p => String(p.id) === String(item.productId));if (!product) fail('record_missing', 'product');
          const price = Number(product['price' + tier]) || Number(product.priceA) || Number(product.priceUSD);
          amount(price, 'unitPrice', { positive: true });
          Object.assign(item, { tier, priceUSD: price, priceTRY: round(price * s.rates.usdTry), priceEUR: round(price * s.rates.usdEur), totalUSD: round(price * item.qty), totalTRY: round(price * item.qty * s.rates.usdTry), totalEUR: round(price * item.qty * s.rates.usdEur) });
        });
      }
      const changes = Array.isArray(c.items) ? c.items : [];
      if (changes.length > 100) fail('too_many_items');
      if (!changes.length && !old) ask('items.0.product', 'record', { kind: 'product', query: '', options: resolve('', s.products, 'product').options });
      changes.forEach((item, index) => {
        const key = 'items.' + index, product = pick('product', item.query, key + '.product');
        if (!product) return;
        const position = items.findIndex(p => String(p.productId) === String(product.id));
        const operation = item.operation || (old ? 'set' : 'add');if (!['add', 'set', 'remove'].includes(operation)) fail('item_operation_invalid');
        if (operation === 'remove') { if (position < 0) fail('item_missing');items.splice(position, 1);return; }
        const existing = position >= 0 ? items[position] : null;
        let quantity = present(item.quantity) ? amount(item.quantity, key + '.quantity', { positive: true, max: 1000000 }) : existing?.qty;
        if (!present(quantity)) { ask(key + '.quantity', 'number');return; }
        if (operation === 'add' && existing && present(item.quantity)) quantity += Number(existing.qty || 0);
        const basePrice = existing?.priceUSD ?? (Number(product['price' + tier]) || Number(product.priceA) || Number(product.priceUSD));
        const price = present(item.unitPrice) ? toUSD(item.unitPrice, item.currency || currency, key + '.unitPrice') : basePrice;
        if (!Number.isFinite(price) || price <= 0) { ask(key + '.unitPrice', 'number');return; }
        const rateTry = Number(s.rates.usdTry), rateEur = Number(s.rates.usdEur);if (!(rateTry > 0 && rateEur > 0)) fail('rate_invalid');
        const row = { ...(existing || {}), productId: product.id, name: product.name, qty: quantity, priceUSD: price, priceTRY: round(price * rateTry), priceEUR: round(price * rateEur), totalUSD: round(quantity * price), totalTRY: round(quantity * price * rateTry), totalEUR: round(quantity * price * rateEur), color: present(item.color) ? text(item.color, key + '.color', 250) : existing?.color || product.color || 'STANDARD', dimensions: existing?.dimensions || product.dimensions || '', dimPieces: existing?.dimPieces || (product.dims?.length ? product.dims : [{l: Number(product.dimL)||0, w: Number(product.dimW)||0, h: Number(product.dimH)||0}]), cbm: Number(existing?.cbm ?? product.cbm) || 0, packets: Number(existing?.packets ?? product.packets) || 1, weight: Number(existing?.weight ?? product.weight) || 0, image: existing?.image || product.image || null, type: product.type || 'other', hsCode: product.hsCode || '', tier, setpcs: existing?.setpcs || 'SET' };
        row.totalCBM = row.cbm * quantity;if (position < 0) items.push(row);else items[position] = row;
      });
      if (questions.length) return finish();if (!items.length) fail('invoice_empty');
      const subtotalUSD = round(items.reduce((n, i) => n + Number(i.totalUSD || 0), 0));amount(subtotalUSD, 'subtotal');
      const discountUSD = present(c.discount) ? toUSD(c.discount, c.discountCurrency || currency, 'discount') : Number(old?.discountUSD || 0);
      if (discountUSD > subtotalUSD) fail('discount_exceeds_total', 'discount');
      const depositUSD = present(c.deposit) ? toUSD(c.deposit, c.depositCurrency || currency, 'deposit') : Number(old?.depositUSD || 0);
      const tax = typeof c.taxEnabled === 'boolean' ? c.taxEnabled : !!old?.kdvEnabled;
      const kdvRate = Number(old?.kdvRate ?? s.settings.kdvRate ?? 20);amount(kdvRate, 'taxRate', { max: 100 });
      const kdvAmtUSD = tax ? round((subtotalUSD - discountUSD) * kdvRate / 100) : 0;
      const grandTotal = round(subtotalUSD - discountUSD + kdvAmtUSD), payments = old ? s.payments.filter(p => String(p.invoiceId) === String(old.id)) : [];
      const totalPaidUSD = round(depositUSD + payments.reduce((n, p) => n + Number(p.amount || 0), 0));if (totalPaidUSD > grandTotal + .005) fail('overpayment', 'deposit');
      const type = co.type || 'external', counter = type === 'internal_retail' ? 'nextNoRet' : type === 'internal_wholesale' ? 'nextNoWhl' : 'nextNoExt';
      const prefix = type === 'internal_retail' ? 'prefixRet' : type === 'internal_wholesale' ? 'prefixWhl' : 'prefixExt';
      const fallback = counter === 'nextNoRet' ? 3000 : counter === 'nextNoWhl' ? 1000 : 5000;
      const next = Number(s.settings[counter]) || fallback;
      const invNo = old?.invNo || String(s.settings[prefix] || (prefix === 'prefixRet' ? 'B' : prefix === 'prefixWhl' ? 'C' : 'A')) + next;
      if (!old && s.invoices.some(i => normalize(i.invNo) === normalize(invNo))) fail('invoice_number_collision');
      const record = { ...(old || {}), id: old?.id || '__NEW__', invNo, companyId: co.id, companyName: co.name, companyLogo: co.logo || null, companyType: type, country: co.country || '', province: co.province || '', city: co.city || '', buyerName: co.buyerName || '', currency, tier, payMethod: c.paymentMethod || old?.payMethod || 'cash', kdvEnabled: tax, kdvRate, kdvAmtUSD, items, subtotalUSD, discountUSD, depositUSD, grandTotal, totalPaidUSD, remainingUSD: round(grandTotal - totalPaidUSD), totalCBM: Number(items.reduce((n, i) => n + Number(i.cbm || 0) * i.qty, 0).toFixed(4)), totalPackets: items.reduce((n, i) => n + Number(i.packets || 1) * i.qty, 0), payments, regDate: date(c.date || old?.regDate || s.today, 'date'), deliveryDate: date(c.deliveryDate ?? old?.deliveryDate ?? '', 'deliveryDate'), loadDate: date(c.loadDate ?? old?.loadDate ?? '', 'loadDate'), notes: c.notes !== undefined && c.notes !== null ? text(c.notes, 'notes', 6000) : old?.notes || s.settings.defaultNotes || '', plate: old?.plate || '', truck: old?.truck || '', createdAt: old?.createdAt || new Date().toISOString(), date: old?.date || s.today, delivered: old?.delivered || false, deliveredAt: old?.deliveredAt || null, usdTry: s.rates.usdTry, usdEur: s.rates.usdEur, printLang: old?.printLang || s.printLang || s.lang, printOpts: old?.printOpts || s.printOpts || {} };
      if (!old) plan.settingsPatch = { [counter]: next + 1 };
      recordWrite('invoices', record);return finish();
    } catch (err) { return { ...plan, status: 'error', error: err.message || 'invalid_command', field: err.field || '', writes: [], deletes: [] }; }
  }
  return { normalize, number, resolve, remember, validateMemory, compile, summarize, label, intents, pages, types, round };
});
