const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_NAME, DEFAULT_LOGO, DEFAULT_ICON, MAX_IMAGE_LENGTH, cleanName, cleanImage, normalize, validate, validateFile, sources, createManager } = require('../app-identity.js');
const logo = 'data:image/png;base64,iVBORw0KGgo=';
const icon = 'data:image/webp;base64,UklGRg==';
const preference = changes => ({ version: 1, name: 'INFINITY — إنفنتي', logo, installIcon: icon, installIconMode: 'custom', ...changes });
function fixture(options = {}) {
  const state = { settings: { companyName: 'Company on invoices', logo: 'original-company-logo', bankName: 'Original bank', branding: { logoShape: 'circle' }, productCategories: { version: 1, categories: [{ id: 'coffee_table' }] } }, invoices: [{ id: 'i1', companyName: 'Original buyer', logo: 'invoice-logo' }] };
  let stored = structuredClone(state.settings);
  const written = [];
  const manager = createManager({ getState: () => state, read: async () => { if (options.readFail) throw new Error('Read failed'); return structuredClone(stored); }, write: async row => { if (options.fail) throw new Error('QuotaExceededError'); await options.beforeCommit?.(row); stored = structuredClone(row); written.push(row); } });
  return { state, manager, written, get stored() { return stored; }, set stored(value) { stored = value; } };
}

test('defaults are WOW FURNITURE and independent from the existing company identity without seeding storage', () => {
  const a = fixture(), before = structuredClone(a.state);
  assert.equal(DEFAULT_NAME, 'مارك ربوت');
  assert.equal(DEFAULT_LOGO, './assets/wow-furniture-logo.svg');
  assert.equal(a.manager.current().name, DEFAULT_NAME);
  assert.deepEqual(sources(a.manager.current()), { logo: DEFAULT_LOGO, icon: DEFAULT_ICON });
  assert.equal(a.written.length, 0);
  assert.deepEqual(a.state, before);
});

test('retired English and Arabic stock identities resolve to full WOW defaults without rewriting records', () => {
  for (const name of ['INFINITY', ' infinity ', 'إنفنتي', 'انفنتي']) {
    for (const artwork of [{}, {logo, installIcon: icon, installIconMode: 'custom'}]) {
      const a = fixture();
      a.state.settings.appIdentity = {version: 1, name, ...artwork};
      const before = structuredClone(a.state);
      assert.deepEqual(a.manager.current(), {version: 1, name: DEFAULT_NAME, logo: '', installIcon: '', installIconMode: 'default'});
      assert.deepEqual(sources(a.manager.current()), {logo: DEFAULT_LOGO, icon: DEFAULT_ICON});
      assert.deepEqual(a.state, before);
      assert.equal(a.written.length, 0);
    }
  }
});

test('unrelated custom names and uploaded artwork remain available after the default brand changes', () => {
  for (const name of ['Personal Brand', 'متجري', 'Société française', 'INFINITY — إنفنتي']) {
    const custom = preference({name});
    assert.deepEqual(normalize({appIdentity: custom}), custom);
    assert.deepEqual(sources(normalize({appIdentity: custom})), {logo, icon});
  }
});

test('save merges the latest settings row while preserving company identity, invoices and other modules', async () => {
  const a = fixture(), company = { name: a.state.settings.companyName, logo: a.state.settings.logo }, invoices = structuredClone(a.state.invoices);
  a.stored = { ...a.stored, bankName: 'New committed bank', unrelatedFuturePreference: { value: 7 } };
  const result = await a.manager.save(preference());
  assert.equal(a.stored.id, 'main');
  assert.equal(a.stored.bankName, 'New committed bank');
  assert.deepEqual(a.stored.unrelatedFuturePreference, { value: 7 });
  assert.equal(a.stored.companyName, company.name);
  assert.equal(a.stored.logo, company.logo);
  assert.equal(a.state.settings.companyName, company.name);
  assert.equal(a.state.settings.logo, company.logo);
  assert.deepEqual(a.state.settings.branding, { logoShape: 'circle' });
  assert.deepEqual(a.stored.productCategories, a.state.settings.productCategories);
  assert.deepEqual(a.state.invoices, invoices);
  assert.deepEqual(a.state.settings.appIdentity, result);
  assert.equal(a.written.length, 1);
});

test('identity and images survive the existing nested-settings backup shape', async () => {
  const a = fixture();
  await a.manager.save(preference());
  const backup = JSON.parse(JSON.stringify({ settings: a.state.settings }));
  assert.deepEqual(normalize(backup.settings), preference());
  assert.equal(sources(normalize(backup.settings)).icon, icon);
  assert.equal(backup.settings.logo, 'original-company-logo');
});

test('write or read failure leaves in-memory settings and invoice data unchanged', async () => {
  for (const options of [{ fail: true }, { readFail: true }]) {
    const a = fixture(options), before = structuredClone(a.state);
    await assert.rejects(a.manager.save(preference()));
    assert.deepEqual(a.state, before);
    assert.equal(a.written.length, 0);
    assert.equal(a.manager.busy, false);
  }
});

test('pending saves neither publish previews nor accept overlapping writes', async () => {
  let finish, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { finish = resolve; });
  const a = fixture({ beforeCommit: async () => { entered(); await gate; } });
  const pending = a.manager.save(preference());
  await started;
  assert.equal(a.state.settings.appIdentity, undefined);
  await assert.rejects(a.manager.save(preference({ name: 'Second' })), /busy/);
  finish(); await pending;
  assert.equal(a.written.length, 1);
  assert.equal(a.state.settings.appIdentity.name, 'INFINITY — إنفنتي');
});

test('default, app-linked and independent installation icons resolve without changing the app logo', () => {
  assert.deepEqual(sources(preference({ installIconMode: 'default' })), { logo, icon: DEFAULT_ICON });
  assert.deepEqual(sources(preference({ installIconMode: 'app' })), { logo, icon: logo });
  assert.deepEqual(sources(preference()), { logo, icon });
  assert.deepEqual(sources(preference({ logo: '', installIconMode: 'app' })), { logo: DEFAULT_LOGO, icon: DEFAULT_LOGO });
});

test('malformed imported settings fall back without mutating the backup or accepting active image content', () => {
  const settings = { companyName: 'Keep', appIdentity: { name: ' ', logo: 'javascript:alert(1)', installIconMode: 'custom', installIcon: 'data:image/svg+xml,<svg onload=alert(1) />' } };
  const before = structuredClone(settings), result = normalize(settings);
  assert.equal(result.name, DEFAULT_NAME);
  assert.equal(result.logo, '');
  assert.equal(result.installIconMode, 'default');
  assert.deepEqual(settings, before);
  assert.equal(normalize({ appIdentity: { name: 'a'.repeat(61) } }).name, DEFAULT_NAME);
});

test('invalid names, images and icon modes fail before reading or writing settings', async () => {
  let reads = 0, writes = 0;
  const manager = createManager({ getState: () => ({ settings: {} }), read: async () => { reads++; return {}; }, write: async () => { writes++; } });
  for (const input of [preference({ name: '' }), preference({ name: ' '.repeat(60) }), preference({ name: 'a'.repeat(61) }), preference({ logo: 'https://example.com/image.png' }), preference({ installIconMode: 'custom', installIcon: '' }), preference({ installIconMode: 'unknown' })]) await assert.rejects(manager.save(input));
  assert.equal(reads, 0);
  assert.equal(writes, 0);
});

test('name normalization preserves multilingual text while removing control characters', () => {
  for (const name of ['إنفنتي للأعمال', 'INFINITY', 'İşletme', 'Société française', 'Бизнес']) assert.equal(validate(preference({ name })).name, name);
  assert.equal(cleanName('  Infinity\u202e\u0000  Store  '), 'Infinity Store');
  assert.equal(validate(preference({ name: '<script>plain text</script>' })).name, '<script>plain text</script>');
});

test('image validator accepts bounded raster data and rejects external, SVG and malformed sources', () => {
  assert.equal(cleanImage(logo), logo);
  assert.equal(cleanImage(icon), icon);
  assert.equal(cleanImage(''), '');
  for (const value of ['data:image/svg+xml;base64,PHN2Zy8+', 'javascript:alert(1)', 'https://example.com/logo.png', 'data:text/html;base64,PHNjcmlwdD4=', 'data:image/png;base64,', 'data:image/png;base64,%%%%', 'data:image/png;base64,A=', 'data:image/png;base64,' + 'A'.repeat(MAX_IMAGE_LENGTH), {}]) assert.equal(cleanImage(value), null);
  for (const type of ['image/png', 'image/jpeg', 'image/webp']) assert.doesNotThrow(() => validateFile({ type, size: 4096 }));
  assert.throws(() => validateFile({ type: 'image/svg+xml', size: 50 }), /imageType/);
  assert.throws(() => validateFile({ type: 'image/png', size: 0 }), /imageSize/);
  assert.throws(() => validateFile({ type: 'image/png', size: 5 * 1024 * 1024 + 1 }), /imageSize/);
});
