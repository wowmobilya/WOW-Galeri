const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const policy = require('../accounts-policy.js');
const actor = (role, permissions = policy.presets(role), extra = {}) => ({role, permissions, status:'active', ...extra});

test('the capability catalog names each actual action in all five UI languages', () => {
  assert.equal(policy.version, 2);
  assert.deepEqual(policy.roles.map(role => role.id), ['owner','manager','sales','carpentry','assembly','warehouse','customer','custom']);
  assert.equal(new Set(policy.sections.map(section => section.id)).size, policy.sections.length);
  assert.equal(new Set(policy.permissionKeys).size, policy.permissionKeys.length);
  for (const item of [...policy.roles, ...policy.actions, ...policy.sections]) {
    for (const lang of ['ar','en','tr','fr','ru']) assert(item.titles[lang]?.trim(), item.id + ' ' + lang);
    assert(Object.isFrozen(item));
  }
  const supported = Object.fromEntries(policy.sections.map(section => [section.id, section.actions]));
  assert.deepEqual(supported.manufacturing, ['view','edit','print']);
  assert.deepEqual(supported.labels, ['view','print']);
  assert.deepEqual(supported.tasks, ['view','edit','delete']);
  assert.deepEqual(supported.reports, ['view']);
  assert(!policy.permissionKeys.includes('materials.print'));
  assert(!policy.permissionKeys.includes('purchasing.delete'));
});

test('normalization denies unknown roles, privileges and malformed input without mutating input', () => {
  const raw = ['invoices.export','invoices.edit','invoices.view','invoices.edit','unknown.view','products.root','*','__proto__.view',null,5];
  const before = raw.slice();
  assert.deepEqual(policy.normalizePermissions('custom', raw), ['invoices.view','invoices.edit','invoices.export']);
  assert.deepEqual(raw, before);
  for (const role of ['administrator','OWNER','__proto__',null]) assert.deepEqual(policy.normalizePermissions(role, policy.permissionKeys), []);
  for (const malformed of [null, undefined, {}, 'invoices.view']) assert.deepEqual(policy.normalizePermissions('sales', malformed), []);
  assert.deepEqual(policy.normalizePermissions('sales', []), []);
});

test('removing view removes all dependent actions, including export, delete and print', () => {
  const grants = ['invoices.edit','invoices.delete','invoices.print','invoices.export','tasks.edit','products.view','products.print'];
  assert.deepEqual(policy.normalizePermissions('custom', grants), ['products.view','products.print']);
  for (const key of ['invoices.edit','invoices.delete','invoices.print','invoices.export','tasks.edit']) assert.equal(policy.can(actor('custom', grants), key), false);
  assert.equal(policy.can(actor('custom', grants), 'products.print'), true);
});

test('customers can only receive buyer and personal permissions, including when checking an unnormalized account', () => {
  const allowed = ['gallery.view','gallery.export','myorders.view','myorders.edit','myorders.print','myorders.export',
    'chat.view','chat.edit','chat.delete','files.view','files.edit','files.delete','files.export'];
  const raw = actor('customer', policy.permissionKeys);
  assert.deepEqual(policy.normalizePermissions('customer', raw.permissions), allowed);
  for (const key of policy.permissionKeys) assert.equal(policy.can(raw, key), allowed.includes(key), key);
  const buyer = actor('customer');
  assert.deepEqual(buyer.permissions, ['gallery.view','myorders.view','myorders.edit','chat.view','chat.edit','files.view','files.edit']);
  assert.equal(policy.safeHome(buyer), 'gallery');
  for (const route of ['gallery','my-orders','chat','files','notifications']) assert(policy.canRoute(buyer, route), route);
  for (const route of ['gallery-studio','gallery-orders','finance','assistant','server-admin','reports']) assert(!policy.canRoute(raw, route), route);
  assert.deepEqual(policy.normalizePermissions('customer', ['files.export','myorders.print','chat.edit']), []);
});

test('the notification bell uses module grants independently of access to financial reports', () => {
  for (const permission of ['reports.view','chat.view','gallery.view','orders.view','myorders.view']) {
    const user = actor('custom', [permission]);
    assert(policy.canNotifications(user));
    assert(policy.canRoute(user, '#notifications'));
    assert.equal(policy.canRoute(user, 'reports'), permission === 'reports.view');
    assert.equal(policy.canNotifications({...user,status:'suspended'}), false);
  }
  assert(policy.canNotifications(actor('owner', [])));
  for (const user of [null,actor('custom', ['files.view']),actor('unknown', ['reports.view'])]) assert(!policy.canNotifications(user));
});

test('only an active owner has account, settings and whole-data administration', () => {
  const reserved = policy.sections.filter(section => section.ownerOnly).map(section => section.id);
  assert.deepEqual(reserved, ['server','settings','accounts','data']);
  for (const role of policy.roles.map(role => role.id).filter(role => role !== 'owner')) {
    const normalized = policy.normalizePermissions(role, policy.permissionKeys);
    for (const id of reserved) {
      assert(!normalized.some(key => key.startsWith(id + '.')));
      assert.equal(policy.can(actor(role, policy.permissionKeys), id + '.view'), false);
    }
  }
  assert.deepEqual(policy.normalizePermissions('owner', []), policy.permissionKeys);
  for (const key of policy.permissionKeys) assert.equal(policy.can(actor('owner', []), key), true, key);
  assert.equal(policy.can(actor('owner'), 'unknown.view'), false);
  assert.equal(policy.can(actor('owner'), 'accounts.manage'), false);
  for (const status of ['disabled','expired','locked','pending',null]) assert.equal(policy.can(actor('owner', [], {status}), 'settings.view'), false);
  assert.equal(policy.can(actor('owner', [], {enabled:false}), 'settings.view'), false);
  assert.equal(policy.can(actor('owner', [], {disabled:true}), 'settings.view'), false);
  assert.equal(policy.can(null, 'invoices.view'), false);
});

test('presets are explicit and independent; workshop roles receive no financial or aggregate search access', () => {
  const one = policy.presets('sales');
  one.push('data.export'); one.length = 0;
  assert(policy.presets('sales').includes('invoices.edit'));
  assert.deepEqual(policy.presets('custom'), []);
  assert.deepEqual(policy.presets('unknown'), []);
  assert.equal(policy.can({role:'sales'}, 'invoices.view'), false);
  for (const role of ['carpentry','assembly','warehouse']) {
    const account = actor(role);
    for (const id of ['customers','products','invoices','payments','reports','materials','costs','purchasing','archives','search','review']) {
      assert.equal(policy.can(account, id + '.view'), false, role + ' ' + id);
    }
    assert.equal(policy.canRoute(account, 'manufacturing'), true);
    assert.equal(policy.canRoute(account, 'dashboard'), false);
    assert.equal(policy.canRoute(account, 'notifications'), false);
  }
  assert.equal(policy.can(actor('sales'), 'invoices.delete'), false);
  assert.equal(policy.can(actor('manager'), 'invoices.delete'), true);
});

test('every existing page has an explicit rule and inherited/unknown routes remain denied', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const declaration = html.match(/const validPages=\[([^\]]+)\]/);
  assert(declaration, 'main router declaration exists');
  const routes = [...declaration[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
  for (const route of routes) assert(policy.permissionForRoute(route), 'missing policy for ' + route);
  for (const route of ['unknown','constructor','toString','__proto__','invoices/../settings','invoices?edit=1','',null,{}]) {
    assert.equal(policy.permissionForRoute(route), null);
    assert.equal(policy.canRoute(actor('owner'), route), false);
  }
  assert.equal(policy.permissionForRoute('#invoices'), 'invoices.view');
});

test('invoice entry routes require edit while operational modules use their own capability', () => {
  const viewer = actor('custom', ['invoices.view']);
  assert.equal(policy.canRoute(viewer, 'invoices'), true);
  for (const route of ['cart','create-invoice','select-invoice-type','quick-barcode']) {
    assert.equal(policy.permissionForRoute(route), 'invoices.edit');
    assert.equal(policy.canRoute(viewer, route), false);
    assert.equal(policy.canRoute(actor('sales'), route), true);
  }
  assert.equal(policy.permissionForRoute('add-company'), 'customers.edit');
  assert.equal(policy.permissionForRoute('select-client-type'), 'customers.edit');
  assert.equal(policy.canRoute(actor('custom', ['customers.view','customers.edit']), 'select-client-type'), true);
  assert.equal(policy.permissionForRoute('cashboxes'), 'payments.view');
  assert.equal(policy.permissionForRoute('add-product'), 'products.edit');
  assert.equal(policy.canRoute(actor('assembly'), 'package-labels'), true);
  assert.equal(policy.canRoute(actor('assembly'), 'invoices'), false);
  assert.equal(policy.canRoute(actor('carpentry'), 'manufacturing'), true);
  assert.equal(policy.canRoute(actor('carpentry'), 'create-invoice'), false);
});

test('safe home always uses a permitted route and returns null for an empty or disabled account', () => {
  for (const [role, route] of Object.entries({owner:'dashboard',manager:'dashboard',sales:'invoices',carpentry:'manufacturing',assembly:'manufacturing',warehouse:'package-labels'})) {
    assert.equal(policy.safeHome(actor(role)), route);
    assert.equal(policy.canRoute(actor(role), policy.safeHome(actor(role))), true);
  }
  assert.equal(policy.safeHome(actor('custom', ['tasks.view'])), 'daily-tasks');
  assert.equal(policy.safeHome(actor('sales', ['labels.view'])), 'package-labels');
  assert.equal(policy.safeHome(actor('custom')), null);
  assert.equal(policy.safeHome(actor('owner', [], {status:'disabled'})), null);
  assert.equal(policy.safeHome(null), null);
});

test('ordinary writes require store-owned privileges; annotations cannot override a write rule', () => {
  for (const [store, section] of Object.entries({companies:'customers',products:'products',invoices:'invoices',payments:'payments'})) {
    for (const type of ['put','add','merge']) assert.equal(policy.permissionForWrite({store,type}), section + '.edit');
    assert.equal(policy.permissionForWrite({store,value:{id:'record'}}), section + '.edit');
    assert.equal(policy.permissionForWrite({store,type:'delete'}), section + '.delete');
  }
  assert.equal(policy.permissionForWrite({store:'settings',type:'merge',id:'main',permission:'tasks.edit'}), 'settings.edit');
  assert.equal(policy.permissionForWrite({store:'invoices',type:'put',permission:'tasks.edit'}), 'invoices.edit');
  for (const operation of [null,{}, {store:'invoices',type:'clear'}, {store:'__proto__',type:'put'}, {store:'accounts',type:'put'}]) assert.equal(policy.permissionForWrite(operation), null);
});

test('browser UMD publishes the same frozen API without Node or application globals', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../accounts-policy.js'), 'utf8'), context);
  const browser = context.WFAccountPolicy;
  assert(Object.isFrozen(browser));
  assert.equal(browser.permissionForRoute('manufacturing'), 'manufacturing.view');
  assert.equal(browser.can({role:'owner',status:'active'}, 'accounts.edit'), true);
  assert.equal(browser.canRoute({role:'owner',status:'active'}, 'new-page'), false);
  assert.equal(browser.presets('assembly').join(','), policy.presets('assembly').join(','));
});
