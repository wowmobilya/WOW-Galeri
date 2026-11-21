/* Product costing arithmetic and immutable invoice cost snapshots.
   Money is converted through USD using the costing record's saved quotes. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WFCostCore = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const currencies = Object.freeze(['USD', 'TRY', 'EUR']);
  const missing = value => value === null || value === undefined || typeof value === 'string' && !value.trim();
  function fail(code, field) { const error = new Error(code); error.code = code; if (field) error.field = field; throw error; }
  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
    return value;
  }
  function amount(value, field, optional = true) {
    if (missing(value)) { if (optional) return null; fail('INVALID_AMOUNT', field); }
    if (!['number', 'string'].includes(typeof value)) fail('INVALID_AMOUNT', field);
    const result = Number(value);
    if (!Number.isFinite(result) || result < 0) fail('INVALID_AMOUNT', field);
    return result;
  }
  function finite(value, field) { if (!Number.isFinite(value) || value < 0) fail('INVALID_AMOUNT', field); return value; }
  function currency(value) { if (!currencies.includes(value)) fail('INVALID_CURRENCY', 'currency'); return value; }
  function normalizeRates(value = {}) {
    const safe = key => { try { const result = amount(value?.[key], key); return result > 0 ? result : null; } catch (_) { return null; } };
    return {usdTry:safe('usdTry'), usdEur:safe('usdEur')};
  }
  function factor(code, rates) {
    currency(code); if (code === 'USD') return 1;
    const key = code === 'TRY' ? 'usdTry' : 'usdEur', value = normalizeRates(rates)[key];
    if (value === null) fail('INVALID_RATE', key);
    return value;
  }
  function convertCurrency(value, from, to, rates) {
    const source = factor(from, rates), target = factor(to, rates);
    const numeric = amount(value, 'amount');
    if (numeric === null) return null;
    return finite(numeric / source * target, 'amount');
  }
  function calculateCosting(source = {}) {
    const code = currency(source.currency || 'USD');
    if (source.materials !== undefined && !Array.isArray(source.materials)) fail('MATERIAL_INCOMPLETE', 'materials');
    const materials = [], rows = source.materials || [];
    let materialTotal = 0, entered = false;
    for (const [index, row] of rows.entries()) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) fail('MATERIAL_INCOMPLETE', 'materials.' + index);
      if ([row.name, row.unit, row.quantity, row.unitPrice].every(missing)) continue;
      const prefix = 'materials.' + index;
      if (typeof row.name !== 'string' || !row.name.trim() || missing(row.quantity) || missing(row.unitPrice)) fail('MATERIAL_INCOMPLETE', prefix);
      const quantity = amount(row.quantity, prefix + '.quantity', false), unitPrice = amount(row.unitPrice, prefix + '.unitPrice', false);
      const total = finite(quantity * unitPrice, prefix);
      materialTotal = finite(materialTotal + total, 'materials'); entered = true;
      const savedRow = {id:typeof row.id === 'string' ? row.id : String(index), name:row.name.trim(), unit:typeof row.unit === 'string' ? row.unit.trim() : '', quantity, unitPrice, total};
      if (['string','number'].includes(typeof row.catalogId) && String(row.catalogId).trim()) {
        savedRow.catalogId = String(row.catalogId).trim();
        savedRow.catalogUpdatedAt = typeof row.catalogUpdatedAt === 'string' ? row.catalogUpdatedAt : null;
      }
      materials.push(savedRow);
    }
    const labor = amount(source.labor, 'labor'), overhead = amount(source.overhead, 'overhead');
    entered = entered || labor !== null || overhead !== null;
    const total = entered ? finite(materialTotal + (labor ?? 0) + (overhead ?? 0), 'total') : null;
    const unitCostUSD = total === null ? null : convertCurrency(total, code, 'USD', source.rates);
    return {currency:code, materials, materialTotal, labor, overhead, total, unitCostUSD, known:entered, rates:normalizeRates(source.rates)};
  }
  function mapMoney(source, convert) {
    const result = clone(source);
    const value = (raw, field) => missing(raw) ? raw : convert(amount(raw, field, false));
    result.materials = (source.materials || []).map((row, index) => ({...clone(row), unitPrice:value(row.unitPrice, 'materials.' + index + '.unitPrice')}));
    result.labor = value(source.labor, 'labor'); result.overhead = value(source.overhead, 'overhead');
    return result;
  }
  function convertDraftCurrency(source, destination) {
    const from = currency(source.currency || 'USD'), to = currency(destination);
    // Validate both quotes before constructing any changed amount.
    const ratio = factor(to, source.rates) / factor(from, source.rates);
    const result = mapMoney(source, value => finite(value * ratio, 'amount'));
    result.currency = to;
    return result;
  }
  function rebaseDraftRates(source, newRates) {
    const code = currency(source.currency || 'USD'), next = normalizeRates(newRates);
    const ratio = factor(code, next) / factor(code, source.rates);
    const result = mapMoney(source, value => finite(value * ratio, 'amount'));
    result.rates = next;
    return result;
  }
  function prepareCosting(source, now = new Date().toISOString()) {
    const result = calculateCosting(source);
    return {version:1, currency:result.currency,
      materials:result.materials.map(({total, ...row}) => row),
      labor:result.labor, overhead:result.overhead, rates:result.rates,
      unitCostUSD:result.unitCostUSD, updatedAt:now};
  }
  function savedUnitCost(source) {
    try { return amount(source?.unitCostUSD, 'unitCostUSD'); } catch (_) { return null; }
  }
  function comparePrice(costUSD, sellingPriceUSD) {
    const cost = amount(costUSD, 'costUSD'), selling = amount(sellingPriceUSD, 'sellingPriceUSD');
    const profitUSD = cost === null || selling === null ? null : selling - cost;
    return {costUSD:cost, sellingPriceUSD:selling, profitUSD,
      margin:profitUSD === null || !(selling > 0) ? null : profitUSD / selling,
      markup:profitUSD === null || !(cost > 0) ? null : profitUSD / cost};
  }
  function captureInvoiceCosts(invoice = {}, products = [], capturedAt = new Date().toISOString()) {
    const result = clone(invoice), index = new Map((Array.isArray(products) ? products : []).map(product => [String(product.id), product]));
    result.items = (Array.isArray(invoice.items) ? invoice.items : []).map(item => {
      const line = clone(item || {});
      // null is an explicit historical unknown and must never be filled later.
      if (Object.prototype.hasOwnProperty.call(line, 'costSnapshot')) return line;
      const costing = index.get(String(line.productId))?.costing, unitCostUSD = savedUnitCost(costing);
      line.costSnapshot = unitCostUSD === null ? null : {
        version:1, unitCostUSD, currency:currencies.includes(costing.currency) ? costing.currency : 'USD',
        rates:normalizeRates(costing.rates), costingUpdatedAt:costing.updatedAt || null, capturedAt
      };
      return line;
    });
    return result;
  }
  function invoiceSummary(invoice = {}) {
    const items = Array.isArray(invoice.items) ? invoice.items : [];
    let knownCostUSD = 0, knownCount = 0, unknownCount = 0, knownQuantity = 0, unknownQuantity = 0, invalidCount = 0;
    let itemSales = 0, itemSalesKnown = true;
    for (const item of items) {
      let qty;
      try { qty = amount(item?.qty, 'qty', false); } catch (_) { invalidCount++; itemSalesKnown = false; continue; }
      if (!qty) continue;
      const unitCost = savedUnitCost(item?.costSnapshot);
      if (unitCost === null) { unknownCount++; unknownQuantity += qty; }
      else {
        const cost = unitCost * qty;
        if (!Number.isFinite(cost) || !Number.isFinite(knownCostUSD + cost)) { invalidCount++; continue; }
        knownCount++; knownQuantity += qty; knownCostUSD += cost;
      }
      try {
        let revenue = amount(item.totalUSD, 'totalUSD');
        if (revenue === null) { const price = amount(item.priceUSD, 'priceUSD'); revenue = price === null ? null : finite(price * qty, 'totalUSD'); }
        if (revenue === null) itemSalesKnown = false; else itemSales = finite(itemSales + revenue, 'subtotalUSD');
      } catch (_) { itemSalesKnown = false; }
    }
    let netSalesUSD = null;
    try {
      const savedSubtotal = amount(invoice.subtotalUSD, 'subtotalUSD');
      const subtotal = savedSubtotal === null ? (itemSalesKnown ? itemSales : null) : savedSubtotal;
      const discount = amount(invoice.discountUSD, 'discountUSD') ?? 0;
      netSalesUSD = subtotal === null ? null : Math.max(0, subtotal - discount);
    } catch (_) { netSalesUSD = null; }
    const lineCount = knownCount + unknownCount + invalidCount;
    const status = invalidCount ? 'invalid' : !lineCount ? 'empty' : !unknownCount ? 'complete' : knownCount ? 'partial' : 'unknown';
    const profitUSD = status === 'complete' && netSalesUSD !== null ? netSalesUSD - knownCostUSD : null;
    return {status, lineCount, knownCount, unknownCount, invalidCount, knownQuantity, unknownQuantity,
      knownCostUSD, totalCostUSD:status === 'complete' ? knownCostUSD : null, netSalesUSD,
      profitUSD, margin:profitUSD !== null && netSalesUSD > 0 ? profitUSD / netSalesUSD : null};
  }
  return Object.freeze({currencies, missing, clone, amount, normalizeRates, convertCurrency, calculateCosting,
    convertDraftCurrency, rebaseDraftRates, prepareCosting, savedUnitCost, comparePrice, captureInvoiceCosts, invoiceSummary});
});
