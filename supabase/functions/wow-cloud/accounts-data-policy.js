/* Projection and transactional field ownership for local application accounts.
 * Read projections are detached. Run final write validation against the raw
 * latest record inside the IndexedDB transaction, never a projected record.
 * An undefined latest value is a preflight; null means a confirmed missing row. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./accounts-policy.js'));
  else root.WFAccountDataPolicy = factory(root.WFAccountPolicy);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (policy) {
  'use strict';
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const stores = new Set(['companies','products','invoices','payments','settings','media']);
  const locales = ['ar','en','tr','fr','ru'];
  const cashboxId = value => typeof value === 'string' && value.startsWith('cashbox-entry/') && value.length > 'cashbox-entry/'.length;
  const has = (account, key) => !!policy?.can(account, key);
  const any = (account, keys) => keys.some(key => has(account, key));
  const owner = account => has(account, 'accounts.edit');
  const usable = account => !!policy?.permissionKeys.some(key => has(account, key));
  function denied(reason) { const error = new Error('ACCESS_DENIED'); error.code = 'ACCESS_DENIED'; error.reason = reason; throw error; }
  function requireGrant(account, key) { if (!has(account, key)) denied(key); }

  function clone(value, seen = new Map()) {
    if (value == null || typeof value !== 'object') return value;
    if (seen.has(value)) return seen.get(value);
    if (value instanceof Date) return new Date(value.getTime());
    const result = Array.isArray(value) ? [] : {};
    seen.set(value, result);
    for (const key of Object.keys(value)) Object.defineProperty(result, key, {value:clone(value[key], seen), enumerable:true, writable:true, configurable:true});
    return result;
  }
  function sameJSON(left, right, seen = new Map()) {
    if (Object.is(left, right)) return true;
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false;
    if (left instanceof Date || right instanceof Date) return left instanceof Date && right instanceof Date && left.getTime() === right.getTime();
    if (seen.get(left) === right) return true;
    seen.set(left, right);
    const a = Object.keys(left), b = Object.keys(right);
    return a.length === b.length && (!Array.isArray(left) || left.length === right.length) && a.every(key => own(right, key) && sameJSON(left[key], right[key], seen));
  }
  function changedKeys(before, after) {
    return [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])].filter(key =>
      own(before, key) !== own(after, key) || !sameJSON(before?.[key], after?.[key]));
  }
  function pick(source, keys) {
    if (!object(source)) return {};
    const result = {};
    for (const key of keys) if (own(source, key)) Object.defineProperty(result, key, {value:clone(source[key]), enumerable:true, writable:true, configurable:true});
    return result;
  }
  // Physical fields must remain scalars; arbitrary nested data cannot travel in
  // a field such as name/image and bypass the nested snapshot allowlists.
  function scalars(source, keys) {
    const result = {};
    if (!object(source)) return result;
    for (const key of keys) if (own(source, key) && (source[key] == null || ['string','number','boolean'].includes(typeof source[key]))) result[key] = source[key];
    return result;
  }
  const physicalProductFields = [
    'id','productId','itemId','lineId','lineIndex','name','type','categoryId','category','categoryName','code','hsCode','barcode','desc','setpcs',
    'color','colorHex','dimensions','dimL','dimW','dimH','cbm','totalCBM','weight','totalWeight','packets','packetCount','totalPackets',
    'qty','quantity','image','imageUrl','createdAt','updatedAt','archived','deleted','isDeleted','status'
  ];
  function physicalProduct(source, depth = 0) {
    if (!object(source)) return source == null ? source : {};
    const result = scalars(source, physicalProductFields);
    for (const field of ['dims','dimPieces']) if (own(source, field)) result[field] = Array.isArray(source[field]) ?
      source[field].map(row => scalars(row, ['id','name','l','w','h','length','width','height','weight','packets','qty','quantity'])) : null;
    if (own(source, 'productSnapshot')) result.productSnapshot = depth < 2 ? physicalProduct(source.productSnapshot, depth + 1) : null;
    return result;
  }
  function physicalTicket(ticket) {
    if (!object(ticket)) return ticket == null ? ticket : null;
    const result = scalars(ticket, ['version','id','invoiceId','invoiceNo','customerName','createdAt','updatedAt','archivedAtCapture']);
    if (own(ticket, 'lines')) result.lines = Array.isArray(ticket.lines) ? ticket.lines.map(line => {
      const next = scalars(line, ['id','status','note','updatedAt']);
      if (own(line, 'item')) next.item = physicalProduct(line.item);
      if (own(line, 'history')) next.history = Array.isArray(line.history) ? line.history.map(entry => scalars(entry, ['at','status','note'])) : [];
      return next;
    }) : [];
    return result;
  }
  function physicalInvoice(source) {
    const result = scalars(source, [
      'id','invNo','name','companyId','companyName','companyType','companyLogo','logoDataUrl','buyerName',
      'date','regDate','orderDate','createdAt','updatedAt','loadDate','deliveryDate','delivered','deliveredAt',
      'archived','archivedAt','deleted','isDeleted','cancelled','canceled','voided','status','plate','truck','totalCBM','totalPackets'
    ]);
    if (own(source, 'items')) result.items = Array.isArray(source.items) ? source.items.map(line => physicalProduct(line)) : [];
    if (own(source, 'packageLabelSnapshot')) result.packageLabelSnapshot = source.packageLabelSnapshot == null ? source.packageLabelSnapshot :
      scalars(source.packageLabelSnapshot, ['version','companyLogo','customerLogo','capturedAt']);
    if (own(source, 'manufacturingTicket')) result.manufacturingTicket = physicalTicket(source.manufacturingTicket);
    return result;
  }
  const costFields = new Set(['costing','costSnapshot','archiveCostCapturedAt','unitCost','unitCostUSD','totalCost','totalCostUSD','costUSD','profit','profitUSD','margin','markup']);
  function withoutCosts(value, seen = new Map()) {
    if (value == null || typeof value !== 'object') return value;
    if (seen.has(value)) return seen.get(value);
    const result = Array.isArray(value) ? [] : {};
    seen.set(value, result);
    for (const key of Object.keys(value)) if (!costFields.has(key)) Object.defineProperty(result, key, {value:withoutCosts(value[key], seen), enumerable:true, writable:true, configurable:true});
    return result;
  }
  const financeViews = ['invoices.view','reports.view','payments.view','archives.view','purchasing.view','costs.view'];
  const physicalViews = ['manufacturing.view','labels.view','review.view','tasks.view'];
  const productViews = ['products.view','invoices.view','costs.view','materials.view','purchasing.view', ...physicalViews];
  function settingsProjection(account, source) {
    if (!object(source)) return undefined;
    if (cashboxId(source.id)) return has(account, 'payments.view') ? pick(source, ['id','date','type','note','legs']) : undefined;
    if (source.id === 'usdTry') return any(account, [...financeViews,'materials.view']) ? pick(source, ['id','value','eur','time','updatedAt','source']) : undefined;
    if (source.id === 'nextInvNo') return has(account, 'invoices.view') ? pick(source, ['id','value']) : undefined;
    if (source.id !== 'main') return undefined;
    const result = scalars(source, ['id','companyName','logo','website']);
    if (own(source, 'appIdentity')) result.appIdentity = scalars(source.appIdentity, ['version','name','logo','installIcon','installIconMode']);
    if (own(source, 'branding')) result.branding = scalars(source.branding, ['logoShape','logoSize','logoBackground','primaryColor','accentColor']);
    if (any(account, productViews) && own(source, 'productCategories')) result.productCategories = clone(source.productCategories);
    if (any(account, financeViews)) Object.assign(result, pick(source, [
      'address','phone','email','mersis','taxNumber','taxOffice','signature','stamp','authPerson','defaultNotes',
      'prefixExt','nextNoExt','prefixRet','nextNoRet','prefixWhl','nextNoWhl','kdvRate','manualUsdTry','manualUsdEur','currencySource'
    ]));
    // Document output needs the company's payment coordinates. This read grant
    // does not authorize opening or changing the company settings workspace.
    if (any(account, ['invoices.print','invoices.export','payments.print','payments.export'])) Object.assign(result,
      pick(source, ['bankName','beneficiary','ibanUSD','ibanTRY','ibanEUR','swift','accountNo']));
    // Unknown future settings are not exposed by any document capability.
    const modules = {
      dailyTasks:['tasks.view'], materialLibrary:['materials.view','costs.view'], procurementOrders:['purchasing.view'],
      labelReprintHistory:['history.view','labels.view','review.view'], packageLabels:['labels.view'], productLabels:['products.view']
    };
    for (const [field, grants] of Object.entries(modules)) if (own(source, field) && any(account, grants)) result[field] = clone(source[field]);
    return result;
  }
  function projectOne(account, store, row) {
    if (row == null) return row;
    if (!object(row)) return undefined;
    if (owner(account)) return clone(row);
    if (store === 'settings') return settingsProjection(account, row);
    if (store === 'media') return undefined;
    if (store === 'companies') {
      if (has(account, 'customers.view')) return clone(row);
      return any(account, ['invoices.view','payments.view','reports.view','archives.view']) ? scalars(row, ['id','name','buyerName','type','logo']) : undefined;
    }
    if (store === 'payments') return any(account, ['payments.view','reports.view']) ? clone(row) : undefined;
    if (store === 'products') {
      if (!any(account, productViews)) return undefined;
      const prices = any(account, ['products.view','invoices.edit','costs.view']);
      if (!prices) return physicalProduct(row);
      return has(account, 'costs.view') ? clone(row) : withoutCosts(row);
    }
    if (store === 'invoices') {
      if (any(account, financeViews)) return has(account, 'costs.view') ? clone(row) : withoutCosts(row);
      return any(account, physicalViews) ? physicalInvoice(row) : undefined;
    }
    return undefined;
  }
  function projectRead(account, store, value) {
    if (!stores.has(store) || !usable(account)) return Array.isArray(value) ? [] : undefined;
    if (Array.isArray(value)) return value.map(row => projectOne(account, store, row)).filter(row => row !== undefined);
    return projectOne(account, store, value);
  }

  function replaceOwned(target, source, key) {
    if (own(source, key)) target[key] = clone(source[key]); else delete target[key];
  }
  function lineIdentity(line) {
    if (!object(line)) return '';
    for (const key of ['lineId','id']) if (line[key] != null && String(line[key])) return key + ':' + String(line[key]);
    return line.productId != null || line.itemId != null ? 'product:' + String(line.productId ?? line.itemId) : '';
  }
  function variant(line) { return JSON.stringify([line?.name ?? '',line?.color ?? '',line?.dimensions ?? '']); }
  function matchLines(before, after) {
    const used = new Set();
    return after.map((line, index) => {
      const identity = lineIdentity(line);
      let candidates = before.map((row, i) => ({row,i})).filter(entry => !used.has(entry.i) && identity && lineIdentity(entry.row) === identity);
      if (candidates.length > 1) {
        const exact = candidates.filter(entry => variant(entry.row) === variant(line));
        if (exact.length === 1) candidates = exact;
        else if (candidates.some(entry => !sameJSON(entry.row?.costSnapshot, candidates[0].row?.costSnapshot) ||
          !sameJSON(entry.row?.productSnapshot?.costing, candidates[0].row?.productSnapshot?.costing))) denied('AMBIGUOUS_COST_SNAPSHOT');
      }
      if (!identity && before[index] && !used.has(index) && !lineIdentity(before[index]) && variant(before[index]) === variant(line)) candidates = [{row:before[index],i:index}];
      if (!identity && !candidates.length && before.some((row, i) => !used.has(i) && !lineIdentity(row) && (own(row, 'costSnapshot') || own(row?.productSnapshot, 'costing')))) denied('AMBIGUOUS_COST_SNAPSHOT');
      const found = candidates[0];
      if (found) used.add(found.i);
      return found?.row;
    });
  }
  function preserveRestrictedFields(account, store, latest, next) {
    if (!object(next) || owner(account) || !object(latest)) return clone(next);
    const result = clone(next);
    if (store === 'products' && !has(account, 'costs.edit')) replaceOwned(result, latest, 'costing');
    if (store === 'invoices') {
      if (!has(account, 'manufacturing.edit')) replaceOwned(result, latest, 'manufacturingTicket');
      if (!has(account, 'costs.edit')) {
        replaceOwned(result, latest, 'archiveCostCapturedAt');
        if (Array.isArray(result.items) && Array.isArray(latest.items)) {
          const matches = matchLines(latest.items, result.items);
          result.items = result.items.map((line, index) => {
            if (!object(line)) return line;
            const prior = matches[index], saved = {...line};
            if (prior) {
              replaceOwned(saved, prior, 'costSnapshot');
              if (object(saved.productSnapshot)) replaceOwned(saved.productSnapshot, prior.productSnapshot, 'costing');
            }
            return saved;
          });
        }
      }
    }
    return result;
  }
  // Call only after the user's candidate passes final validateWrite, using raw
  // products read inside the same transaction. Never publish this result before
  // applying projectRead. The caller may pass its captured transaction time;
  // otherwise the candidate's saved timestamp keeps this transformation pure.
  function captureTrustedInvoiceCosts(account, latest, next, products, costCore, capturedAt) {
    if (!has(account, 'invoices.edit') || has(account, 'costs.view')) return next;
    if (!object(next) || !Array.isArray(next.items) || !Array.isArray(products) || typeof costCore?.captureInvoiceCosts !== 'function') denied('MISSING_COST_CAPTURE_SOURCE');
    const prepared = clone(next), previous = Array.isArray(latest?.items) ? latest.items : [];
    const matches = matchLines(previous, prepared.items);
    prepared.items = prepared.items.map((line, index) => {
      if (!object(line)) denied('INVALID_COST_CAPTURE_LINE');
      const source = matches[index], result = {...line};
      // Explicit historical null is intentional. A null added by the staff UI
      // to a new line, however, came from a price-redacted catalog, so recapture
      // it from the trusted product data instead of freezing an invented unknown.
      if (source && own(source, 'costSnapshot')) result.costSnapshot = clone(source.costSnapshot);
      else delete result.costSnapshot;
      return result;
    });
    const at = capturedAt ?? next.updatedAt ?? next.createdAt ?? null;
    return costCore.captureInvoiceCosts(prepared, products, at);
  }
  function removedRows(before, after) {
    const ids = new Set((Array.isArray(after) ? after : []).map(row => String(row?.id)));
    return (Array.isArray(before) ? before : []).some(row => !ids.has(String(row?.id)));
  }
  function editedRows(before, after) {
    const byId = new Map((Array.isArray(before) ? before : []).map(row => [String(row?.id),row]));
    return (Array.isArray(after) ? after : []).some(row => !sameJSON(byId.get(String(row?.id)), row));
  }
  function validateTasks(account, previous, next, operation) {
    if (!object(next) || !Array.isArray(next.items)) denied('INVALID_TASKS');
    const old = Array.isArray(previous?.items) ? previous.items : [];
    const deleted = removedRows(old, next.items) || operation.value?.type === 'delete';
    const edited = editedRows(old, next.items);
    if (deleted) requireGrant(account, 'tasks.delete');
    if (edited || !deleted) requireGrant(account, 'tasks.edit');
  }
  function validateCounter(account, key, before, next) {
    requireGrant(account, 'invoices.edit');
    const fallback = {nextNoRet:3000,nextNoWhl:1000,nextNoExt:5000,value:5001}[key];
    const prior = before == null ? fallback : Number(before);
    if (!Number.isSafeInteger(prior) || !Number.isSafeInteger(next) || next !== prior + 1) denied('INVALID_INVOICE_COUNTER');
  }
  function validatePrintPreference(account, key, before, next) {
    requireGrant(account, key === 'productLabels' ? 'products.print' : 'labels.print');
    if (!object(next)) denied('INVALID_PRINT_PREFERENCE');
    const permitted = key === 'productLabels' ? ['locale'] : ['locale','profileId','orientation'];
    if (changedKeys(before, next).some(field => !permitted.includes(field))) denied('INVALID_PRINT_PREFERENCE');
    if (own(next, 'locale') && !locales.includes(next.locale)) denied('INVALID_PRINT_LOCALE');
    if (own(next, 'profileId') && (typeof next.profileId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(next.profileId))) denied('INVALID_PRINT_PROFILE');
    if (own(next, 'orientation') && !['portrait','landscape','square'].includes(next.orientation)) denied('INVALID_PRINT_ORIENTATION');
  }
  function validateSettings(account, operation, latest, next) {
    const id = next?.id ?? operation.id;
    if (cashboxId(id)) {
      requireGrant(account, 'payments.edit');
      if (Object.keys(next).some(key => !['id','date','type','note','legs'].includes(key)) ||
        !['receipt','expense','transfer','opening'].includes(next.type) || typeof next.date !== 'string' || !Number.isFinite(Date.parse(next.date)) ||
        typeof next.note !== 'string' || next.note.length > 180 || !Array.isArray(next.legs) || next.legs.length !== (next.type === 'transfer' ? 2 : 1)) denied('INVALID_CASHBOX_ENTRY');
      for (const [index, leg] of next.legs.entries()) {
        if (!object(leg) || Object.keys(leg).some(key => !['currency','units'].includes(key)) || !['TRY','SYP','USD','EUR'].includes(leg.currency) ||
          !Number.isSafeInteger(leg.units) || leg.units === 0 || (index === 0 && ['expense','transfer'].includes(next.type) ? leg.units > 0 : leg.units < 0)) denied('INVALID_CASHBOX_ENTRY');
      }
      if (next.type === 'transfer' && next.legs[0].currency === next.legs[1].currency) denied('INVALID_CASHBOX_ENTRY');
      return true;
    }
    if (latest === undefined) {
      if (id === 'nextInvNo' && has(account, 'invoices.edit')) return true;
      if (id === 'main' && any(account, ['invoices.edit','tasks.edit','tasks.delete','materials.edit','purchasing.edit','history.edit','labels.print','products.print'])) return true;
      denied('settings.edit');
    }
    if (id === 'nextInvNo') {
      if (changedKeys(latest, next).some(key => key !== 'id' && key !== 'value')) denied('settings.edit');
      validateCounter(account, 'value', latest?.value, next.value); return true;
    }
    if (id !== 'main' || (latest && latest.id !== 'main')) denied('settings.edit');
    const changes = changedKeys(latest, next).filter(key => key !== 'id');
    if (!changes.length) {
      if (!any(account, ['invoices.edit','tasks.edit','tasks.delete','materials.edit','purchasing.edit','history.edit','labels.print','products.print'])) denied('settings.edit');
      return true;
    }
    for (const key of changes) {
      if (['nextNoExt','nextNoRet','nextNoWhl'].includes(key)) { validateCounter(account, key, latest?.[key], next[key]); continue; }
      if (operation.type !== 'merge') denied('SHARED_SETTINGS_REQUIRE_MERGE');
      if (key === 'dailyTasks') validateTasks(account, latest?.dailyTasks, next.dailyTasks, operation);
      else if (key === 'materialLibrary') requireGrant(account, 'materials.edit');
      else if (key === 'procurementOrders') requireGrant(account, 'purchasing.edit');
      else if (key === 'labelReprintHistory') { if (!any(account, ['labels.print','history.edit'])) denied('history.edit'); }
      else if (key === 'productLabels' || key === 'packageLabels') validatePrintPreference(account, key, latest?.[key], next[key]);
      else denied('settings.edit');
    }
    return true;
  }
  function validateProducts(account, latest, next) {
    if (latest === undefined) { if (!any(account, ['products.edit','costs.edit'])) denied('products.edit'); return true; }
    const changes = changedKeys(latest, next).filter(key => key !== 'id');
    if (changes.includes('costing')) requireGrant(account, 'costs.edit');
    if (changes.some(key => key !== 'costing') || !latest) requireGrant(account, 'products.edit');
    if (!changes.length && !any(account, ['products.edit','costs.edit'])) denied('products.edit');
    return true;
  }
  function validateInvoiceCosts(account, latest, next) {
    if (has(account, 'costs.edit')) return;
    if (!sameJSON(latest?.archiveCostCapturedAt, next.archiveCostCapturedAt)) denied('costs.edit');
    const old = Array.isArray(latest?.items) ? latest.items : [], rows = Array.isArray(next.items) ? next.items : [];
    const matches = matchLines(old, rows);
    rows.forEach((line, index) => {
      const previous = matches[index];
      if (previous) {
        const unknownCapture = !own(previous, 'costSnapshot') && line?.costSnapshot === null;
        if (!unknownCapture && (!sameJSON(previous.costSnapshot, line?.costSnapshot) || own(previous, 'costSnapshot') !== own(line, 'costSnapshot'))) denied('costs.edit');
        if (!sameJSON(previous.productSnapshot?.costing, line?.productSnapshot?.costing)) denied('costs.edit');
      } else if (line?.costSnapshot != null || line?.productSnapshot?.costing != null) denied('costs.edit');
    });
  }
  function validateInvoices(account, operation, latest, next) {
    if (latest === undefined) {
      if (!any(account, ['invoices.edit','manufacturing.edit','archives.edit','payments.edit','payments.delete'])) denied('invoices.edit');
      return true;
    }
    if (!latest) {
      requireGrant(account, 'invoices.edit');
      if (next.manufacturingTicket != null) requireGrant(account, 'manufacturing.edit');
      if (next.archived === true) requireGrant(account, 'archives.edit');
      if (Array.isArray(next.payments) && next.payments.length) requireGrant(account, 'payments.edit');
      validateInvoiceCosts(account, latest, next); return true;
    }
    const changes = changedKeys(latest, next).filter(key => key !== 'id');
    if (!changes.length) {
      if (!any(account, ['invoices.edit','manufacturing.edit','archives.edit','payments.edit','payments.delete'])) denied('invoices.edit');
      return true;
    }
    validateInvoiceCosts(account, latest, next);
    if (changes.includes('manufacturingTicket')) requireGrant(account, 'manufacturing.edit');
    const archiveFields = ['archived','archivedAt','delivered','deliveredAt','archiveCostCapturedAt'];
    if (changes.some(key => archiveFields.includes(key))) requireGrant(account, 'archives.edit');
    const paymentChanged = changes.includes('payments');
    if (paymentChanged) {
      const previous = Array.isArray(latest.payments) ? latest.payments : [], payments = Array.isArray(next.payments) ? next.payments : [];
      if (removedRows(previous, payments)) requireGrant(account, 'payments.delete');
      if (editedRows(previous, payments)) requireGrant(account, 'payments.edit');
      if (!removedRows(previous, payments) && !editedRows(previous, payments)) requireGrant(account, 'payments.edit');
    }
    const remaining = changes.filter(key => key !== 'manufacturingTicket' && !archiveFields.includes(key) && key !== 'payments' &&
      !(paymentChanged && ['totalPaidUSD','remainingUSD'].includes(key)));
    const archiveOnly = any(account, ['archives.edit']) && remaining.every(key => key === 'packageLabelSnapshot' || key === 'items' && sameJSON(withoutCosts(latest.items), withoutCosts(next.items)));
    if (remaining.length && !archiveOnly) requireGrant(account, 'invoices.edit');
    return true;
  }
  function validateWrite(account, operation, latest, next) {
    if (!object(operation) || !stores.has(operation.store) || !usable(account)) denied('INVALID_ACTOR_OR_STORE');
    const type = operation.type === undefined ? 'put' : operation.type;
    if (!['put','add','merge','delete'].includes(type)) denied('INVALID_OPERATION');
    if (owner(account)) return true;
    if (operation.store === 'media') denied('data.edit');
    if (type === 'delete') {
      if (operation.store === 'settings' && cashboxId(operation.id)) {requireGrant(account, 'payments.delete'); return true;}
      const permission = policy.permissionForWrite({...operation,type});
      if (!permission || operation.store === 'settings') denied('data.delete');
      requireGrant(account, permission); return true;
    }
    if (!object(next) || next.id == null || latest && (!object(latest) || latest.id !== next.id) ||
      operation.id != null && operation.id !== next.id) denied('RECORD_ID_CHANGED');
    if (operation.store === 'settings') return validateSettings(account, operation, latest, next);
    if (operation.store === 'products') return validateProducts(account, latest, next);
    if (operation.store === 'invoices') return validateInvoices(account, operation, latest, next);
    requireGrant(account, policy.permissionForWrite({...operation,type}));
    return true;
  }

  return Object.freeze({version:1, projectRead, validateWrite, preserveRestrictedFields, captureTrustedInvoiceCosts, sameJSON});
});
