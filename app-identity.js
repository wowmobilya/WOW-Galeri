/* Application identity is independent from the company identity on documents. */
(() => {
  'use strict';
  const DEFAULT_NAME = 'مارك ربوت';
  const DEFAULT_LOGO = './assets/wow-furniture-logo.svg';
  const DEFAULT_ICON = './app-icon-512.png?v=198';
  const MAX_IMAGE_LENGTH = 2100000;
  const locales = ['ar', 'en', 'tr', 'fr', 'ru'];
  const modes = ['default', 'app', 'custom'];
  const cleanName = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim() : '';
  function cleanImage(value) {
    if (value == null || value === '') return '';
    return typeof value === 'string' && value.length <= MAX_IMAGE_LENGTH && /^data:image\/(?:png|jpeg|webp);base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value) && value.includes(',') && value.split(',')[1] ? value : null;
  }
  function normalize(settings) {
    const raw = settings?.appIdentity || {};
    const savedName = cleanName(raw.name);
    const legacyDefault = /^(?:infinity|إنفنتي|انفنتي)$/i.test(savedName);
    // Resolve the retired stock identity on read, including its uploaded
    // artwork. Unrelated custom identities and stored company data stay intact.
    const defaultAlias = /^(?:wow furniture|galeri)$/i.test(savedName);
    const name = legacyDefault || defaultAlias ? DEFAULT_NAME : savedName;
    const logo = legacyDefault ? '' : cleanImage(raw.logo) || '';
    const installIcon = legacyDefault ? '' : cleanImage(raw.installIcon) || '';
    let installIconMode = !legacyDefault && modes.includes(raw.installIconMode) ? raw.installIconMode : 'default';
    if (installIconMode === 'custom' && !installIcon) installIconMode = 'default';
    return { version: 1, name: name && name.length <= 60 ? name : DEFAULT_NAME, logo, installIcon, installIconMode };
  }
  function validate(input) {
    const name = cleanName(input?.name);
    if (!name || name.length > 60) throw new Error('nameRequired');
    const logo = cleanImage(input?.logo), installIcon = cleanImage(input?.installIcon);
    if (logo === null || installIcon === null) throw new Error('imageInvalid');
    if (!modes.includes(input?.installIconMode)) throw new Error('iconMode');
    if (input.installIconMode === 'custom' && !installIcon) throw new Error('iconRequired');
    return { version: 1, name, logo, installIcon, installIconMode: input.installIconMode };
  }
  function validateFile(file) {
    if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('imageType');
    if (!Number.isFinite(file.size) || file.size <= 0 || file.size > 5 * 1024 * 1024) throw new Error('imageSize');
  }
  function sources(identity) {
    return { logo: identity.logo || DEFAULT_LOGO, icon: identity.installIconMode === 'app' ? identity.logo || DEFAULT_LOGO : identity.installIconMode === 'custom' ? identity.installIcon || DEFAULT_ICON : DEFAULT_ICON };
  }
  function createManager({ getState, read, write }) {
    let pending = false;
    return {
      get busy() { return pending; },
      current: () => normalize(getState().settings),
      async save(input) {
        if (pending) throw new Error('busy');
        const payload = validate(input);
        pending = true;
        try {
          const stored = await read();
          const base = { ...getState().settings, ...(stored || {}) };
          await write({ ...base, id: 'main', appIdentity: payload });
          // Publish only this preference after the storage transaction commits.
          // Invoices, company name/logo and other settings remain their owners'.
          getState().settings.appIdentity = payload;
          return payload;
        } finally { pending = false; }
      }
    };
  }
  const core = { DEFAULT_NAME, DEFAULT_LOGO, DEFAULT_ICON, MAX_IMAGE_LENGTH, cleanName, cleanImage, normalize, validate, validateFile, sources, createManager };
  if (typeof module === 'object' && module.exports) module.exports = core;
  if (typeof document === 'undefined' || window.WFAppIdentity) return;
  const state = () => typeof S === 'object' ? S : { settings: {} };
  const manager = createManager({ getState: state, read: () => dbGet('settings', 'main'), write: row => dbPut('settings', row) });
  const copy = {
    title: ['هوية التطبيق والتثبيت', 'App identity and installation', 'Uygulama kimliği ve yükleme', 'Identité et installation', 'Оформление и установка'],
    intro: ['اسم التطبيق وشعاره وأيقونة التثبيت مستقلة عن بيانات الشركة وشعار الفواتير.', 'The app name, logo and installation icon are separate from your company details and invoice logo.', 'Uygulama adı, logosu ve yükleme simgesi şirket bilgilerinden ve fatura logosundan bağımsızdır.', 'Le nom, le logo et l’icône de l’application sont indépendants de votre entreprise et du logo des factures.', 'Название, логотип и значок приложения не связаны с реквизитами компании и логотипом в счетах.'],
    name: ['اسم التطبيق', 'App name', 'Uygulama adı', 'Nom de l’application', 'Название приложения'],
    nameHint: ['حتى 60 حرفًا. يظهر في البرنامج والتثبيت المدعوم.', 'Up to 60 characters. Used in the app and supported installations.', 'En fazla 60 karakter. Uygulamada ve desteklenen yüklemelerde gösterilir.', '60 caractères maximum. Utilisé dans l’application et les installations compatibles.', 'До 60 символов. Используется в приложении и при поддерживаемой установке.'],
    appLogo: ['شعار التطبيق', 'App logo', 'Uygulama logosu', 'Logo de l’application', 'Логотип приложения'],
    appPreview: ['معاينة داخل البرنامج', 'In-app preview', 'Uygulama önizlemesi', 'Aperçu dans l’application', 'Предпросмотр приложения'],
    uploadLogo: ['اختيار شعار', 'Choose a logo', 'Logo seçin', 'Choisir un logo', 'Выберите логотип'],
    resetLogo: ['استعادة شعار WOW FURNITURE', 'Restore WOW FURNITURE logo', 'WOW FURNITURE logosunu geri yükle', 'Rétablir le logo WOW FURNITURE', 'Вернуть логотип WOW FURNITURE'],
    imageHint: ['PNG أو JPG أو WebP، حتى 5 ميغابايت. تظهر الصورة كاملة دون قص.', 'PNG, JPG or WebP, up to 5 MB. The whole image is preserved without cropping.', 'PNG, JPG veya WebP, en fazla 5 MB. Görsel kırpılmadan bütünüyle korunur.', 'PNG, JPG ou WebP, 5 Mo maximum. L’image entière est conservée sans recadrage.', 'PNG, JPG или WebP, до 5 МБ. Изображение сохраняется целиком без обрезки.'],
    installIcon: ['أيقونة التثبيت', 'Installation icon', 'Yükleme simgesi', 'Icône d’installation', 'Значок установки'],
    defaultIcon: ['أيقونة WOW FURNITURE', 'WOW FURNITURE icon', 'WOW FURNITURE simgesi', 'Icône WOW FURNITURE', 'Значок WOW FURNITURE'],
    appIcon: ['استخدام شعار التطبيق', 'Use the app logo', 'Uygulama logosunu kullan', 'Utiliser le logo de l’application', 'Использовать логотип приложения'],
    customIcon: ['أيقونة خاصة', 'Custom icon', 'Özel simge', 'Icône personnalisée', 'Свой значок'],
    uploadIcon: ['اختيار صورة للأيقونة', 'Choose an icon image', 'Simge görseli seçin', 'Choisir une image pour l’icône', 'Выберите изображение значка'],
    resetIcon: ['استعادة الأيقونة الافتراضية', 'Restore default icon', 'Varsayılan simgeyi geri yükle', 'Rétablir l’icône par défaut', 'Вернуть исходный значок'],
    installHint: ['تظهر الهوية داخل البرنامج بعد الحفظ. التخصيص خاص بهذا الجهاز ويعتمد على المتصفح؛ قد يطلب الجهاز تأكيد الاسم والأيقونة، وقد يلزم إعادة إضافة الاختصار.', 'The identity changes in the app after saving. Customization is for this device and depends on the browser; your device may ask you to confirm the name and icon, or add the shortcut again.', 'Kimlik kayıttan sonra uygulamada değişir. Özelleştirme bu cihaza özeldir ve tarayıcıya bağlıdır; cihaz ad ve simgeyi onaylamanızı veya kısayolu yeniden eklemenizi isteyebilir.', 'L’identité change après l’enregistrement. La personnalisation concerne cet appareil et dépend du navigateur ; il peut demander de confirmer le nom et l’icône ou d’ajouter à nouveau le raccourci.', 'Оформление изменится после сохранения. Настройка действует на этом устройстве и зависит от браузера; устройство может запросить подтверждение названия и значка или повторное добавление ярлыка.'],
    save: ['حفظ هوية التطبيق', 'Save app identity', 'Uygulama kimliğini kaydet', 'Enregistrer l’identité', 'Сохранить оформление'],
    revert: ['إلغاء التعديلات', 'Discard changes', 'Değişiklikleri geri al', 'Annuler les modifications', 'Отменить изменения'],
    saving: ['جارٍ الحفظ…', 'Saving…', 'Kaydediliyor…', 'Enregistrement…', 'Сохранение…'],
    loading: ['جارٍ تجهيز الصورة…', 'Preparing image…', 'Görsel hazırlanıyor…', 'Préparation de l’image…', 'Подготовка изображения…'],
    saved: ['تم حفظ هوية التطبيق.', 'App identity saved.', 'Uygulama kimliği kaydedildi.', 'Identité enregistrée.', 'Оформление сохранено.'],
    unsaved: ['معاينة — اضغط حفظ لتطبيق التعديلات.', 'Preview — save to apply your changes.', 'Önizleme — değişiklikleri uygulamak için kaydedin.', 'Aperçu — enregistrez pour appliquer les modifications.', 'Предпросмотр — сохраните, чтобы применить изменения.'],
    failed: ['تعذّر الحفظ. بقيت الهوية السابقة كما هي؛ حاول مجددًا.', 'Could not save. The previous identity is preserved; try again.', 'Kaydedilemedi. Önceki kimlik korundu; tekrar deneyin.', 'Enregistrement impossible. L’identité précédente est conservée ; réessayez.', 'Не удалось сохранить. Прежнее оформление сохранено; повторите попытку.'],
    nameRequired: ['اكتب اسمًا من حرف واحد إلى 60 حرفًا.', 'Enter a name between 1 and 60 characters.', '1–60 karakterlik bir ad girin.', 'Saisissez un nom de 1 à 60 caractères.', 'Введите название длиной от 1 до 60 символов.'],
    imageType: ['اختر صورة PNG أو JPG أو WebP.', 'Choose a PNG, JPG or WebP image.', 'PNG, JPG veya WebP seçin.', 'Choisissez une image PNG, JPG ou WebP.', 'Выберите изображение PNG, JPG или WebP.'],
    imageSize: ['حجم الصورة الأقصى 5 ميغابايت.', 'Maximum image size is 5 MB.', 'En büyük görsel boyutu 5 MB.', 'Taille maximale : 5 Mo.', 'Максимальный размер изображения — 5 МБ.'],
    imageInvalid: ['تعذّر قراءة الصورة. اختر صورة أخرى.', 'Could not read the image. Choose another one.', 'Görsel okunamadı. Başka bir görsel seçin.', 'Image illisible. Choisissez-en une autre.', 'Не удалось прочитать изображение. Выберите другое.'],
    iconRequired: ['اختر صورة للأيقونة الخاصة أو استخدم خيارًا آخر.', 'Choose a custom icon image or another icon option.', 'Özel simge görseli seçin veya başka bir seçeneği kullanın.', 'Choisissez une image personnalisée ou une autre option.', 'Выберите изображение своего значка или другой вариант.'],
    iconMode: ['اختر نوع الأيقونة.', 'Choose an icon option.', 'Bir simge seçeneği belirleyin.', 'Choisissez une option d’icône.', 'Выберите вариант значка.'],
    install: ['تثبيت التطبيق', 'Install app', 'Uygulamayı yükle', 'Installer l’application', 'Установить приложение'],
    download: ['تنزيل الأيقونة', 'Download icon', 'Simgeyi indir', 'Télécharger l’icône', 'Скачать значок'],
    installUnavailable: ['استخدم خيار «التثبيت» أو «إضافة إلى الشاشة الرئيسية» من قائمة المتصفح إذا كان متاحًا.', 'Use Install or Add to Home Screen in your browser menu when available.', 'Varsa tarayıcı menüsündeki Yükle veya Ana Ekrana Ekle seçeneğini kullanın.', 'Utilisez Installer ou Ajouter à l’écran d’accueil dans le menu du navigateur, si disponible.', 'Если доступно, выберите «Установить» или «На главный экран» в меню браузера.'],
    installFallback: ['تم حفظ الهوية داخل البرنامج. يستخدم هذا المتصفح هوية التثبيت الافتراضية.', 'The in-app identity is saved. This browser uses the default installation identity.', 'Uygulama kimliği kaydedildi. Bu tarayıcı varsayılan yükleme kimliğini kullanır.', 'L’identité est enregistrée dans l’application. Ce navigateur utilise l’identité d’installation par défaut.', 'Оформление в приложении сохранено. Этот браузер использует стандартное оформление установки.'],
    actionFailed: ['تعذّر إكمال هذا الإجراء. حاول مجددًا.', 'Could not complete this action. Try again.', 'Bu işlem tamamlanamadı. Tekrar deneyin.', 'Cette action a échoué. Réessayez.', 'Не удалось выполнить действие. Повторите попытку.']
  };
  const locale = () => document.documentElement.lang || state().lang || 'ar';
  const t = key => copy[key]?.[Math.max(0, locales.indexOf(locale()))] || key;
  const textNodes = [];
  function node(tag, className, content) { const el = document.createElement(tag); if (className) el.className = className; if (content != null) el.textContent = content; return el; }
  function translated(tag, key, className) { const el = node(tag, className, t(key)); textNodes.push([el, key]); return el; }
  function button(key, callback, className) { const el = translated('button', key, className); el.type = 'button'; el.addEventListener('click', callback); return el; }
  const workspace = document.querySelector('#page-settings .wf-settings-workspace');
  const tabs = workspace?.querySelector('.tabs'), content = workspace?.querySelector('.wf-settings-content');
  if (!tabs || !content) return;
  const tab = node('button', 'tab-btn'); tab.type = 'button'; tab.id = 'wf-settings-tab-app-identity';
  tab.setAttribute('onclick', "switchTab('app-identity')"); tab.setAttribute('aria-controls', 'stab-app-identity');
  const mark = node('img', 'wf-app-identity-mark'); mark.src = DEFAULT_LOGO; mark.alt = ''; mark.width = 62; mark.height = 24; mark.setAttribute('aria-hidden', 'true');
  tab.append(mark, translated('span', 'title')); tabs.append(tab);
  const panel = node('section', 'wf-app-identity-settings'); panel.id = 'stab-app-identity'; panel.style.display = 'none';
  panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', tab.id); content.append(panel);
  const intro = translated('p', 'intro', 'wf-app-identity-intro'); panel.append(intro);
  const form = node('form', 'wf-app-identity-form'), fields = node('fieldset'); form.append(fields); panel.append(form);
  const mainPreview = node('div', 'wf-app-identity-preview'), logoPreview = node('img'), previewCopy = node('div'); logoPreview.alt = '';
  const previewName = node('strong'); previewName.dir = 'auto'; previewCopy.append(translated('small', 'appPreview'), previewName); mainPreview.append(logoPreview, previewCopy); fields.append(mainPreview);
  const nameLabel = translated('label', 'name', 'wf-app-identity-label'); nameLabel.htmlFor = 'wfAppIdentityName';
  const nameInput = node('input', 'fc'); nameInput.id = 'wfAppIdentityName'; nameInput.type = 'text'; nameInput.dir = 'auto'; nameInput.required = true; nameInput.maxLength = 60; nameInput.autocomplete = 'off';
  const nameHint = translated('small', 'nameHint', 'wf-app-identity-hint'); nameHint.id = 'wfAppIdentityNameHint'; nameInput.setAttribute('aria-describedby', nameHint.id);
  const nameGroup = node('div', 'wf-app-identity-field'); nameGroup.append(nameLabel, nameInput, nameHint); fields.append(nameGroup);
  const cards = node('div', 'wf-app-identity-cards'); fields.append(cards);
  let draft = manager.current(), dirty = false, busy = false, fileLoading = false, uploadRevision = 0, statusKey = '', statusError = false;
  const appCard = node('section', 'wf-app-identity-card'); appCard.append(translated('h3', 'appLogo'));
  function fileInput(id, key, parent) {
    const label = translated('label', key, 'wf-app-identity-label'); label.htmlFor = id;
    const input = node('input', 'wf-app-identity-file'); input.id = id; input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp';
    const hint = translated('small', 'imageHint', 'wf-app-identity-hint'); hint.id = id + 'Hint'; input.setAttribute('aria-describedby', hint.id);
    parent.append(label, input, hint); return input;
  }
  const logoInput = fileInput('wfAppIdentityLogo', 'uploadLogo', appCard);
  appCard.append(button('resetLogo', () => { cancelUpload(); draft.logo = ''; changeDraft(); }, 'wf-app-identity-secondary'));
  const iconCard = node('section', 'wf-app-identity-card'); iconCard.append(translated('h3', 'installIcon'));
  const iconPreview = node('img', 'wf-app-install-preview'); iconPreview.alt = ''; iconCard.append(iconPreview);
  const modeGroup = node('fieldset', 'wf-app-icon-options'); modeGroup.append(translated('legend', 'installIcon'));
  const radios = [];
  for (const [value, key] of [['default', 'defaultIcon'], ['app', 'appIcon'], ['custom', 'customIcon']]) {
    const label = node('label', 'wf-app-icon-choice'), input = node('input'); input.type = 'radio'; input.name = 'wf-app-icon-mode'; input.value = value;
    input.addEventListener('change', () => { if (input.checked) { draft.installIconMode = value; changeDraft(); } });
    label.append(input, translated('span', key)); modeGroup.append(label); radios.push(input);
  }
  iconCard.append(modeGroup);
  const iconInput = fileInput('wfAppIdentityIcon', 'uploadIcon', iconCard);
  iconCard.append(button('resetIcon', () => { cancelUpload(); draft.installIcon = ''; draft.installIconMode = 'default'; changeDraft(); }, 'wf-app-identity-secondary'));
  cards.append(appCard, iconCard);
  const installHint = translated('p', 'installHint', 'wf-app-identity-install-hint'); fields.append(installHint);
  const actions = node('div', 'wf-app-identity-actions');
  const save = translated('button', 'save', 'btn btn-p'); save.type = 'submit';
  const discard = button('revert', () => { reloadDraft(); announce(''); }, 'btn btn-s'); actions.append(save, discard); fields.append(actions);
  const status = node('p', 'wf-app-identity-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); panel.append(status);
  const installationActions = node('div', 'wf-app-install-actions');
  const installButton = button('install', async () => {
    try { const result = await window.wfInstallIdentity?.install?.(); if (!result || ['unavailable', 'failed'].includes(result.outcome)) announce('installUnavailable'); }
    catch (_) { announce('installUnavailable'); }
  }, 'wf-app-identity-secondary');
  const downloadButton = button('download', async () => { try { if (!window.wfInstallIdentity?.downloadIcon) throw new Error(); const result = await window.wfInstallIdentity.downloadIcon(); if (result?.downloaded === false) announce('actionFailed', true); } catch (_) { announce('actionFailed', true); } }, 'wf-app-identity-secondary');
  installationActions.append(installButton, downloadButton); panel.append(installationActions);
  function announce(key, error = false) { statusKey = key; statusError = error; status.textContent = key ? t(key) : ''; status.setAttribute('role', error ? 'alert' : 'status'); status.classList.toggle('is-error', error); }
  function updateBusy() {
    const capability = window.wfInstallIdentity?.status?.() || {};
    fields.disabled = busy || fileLoading; save.disabled = busy || fileLoading;
    panel.setAttribute('aria-busy', String(busy || fileLoading));
    installButton.disabled = dirty || busy || fileLoading || !!capability.preparing || !capability.canInstall;
    downloadButton.disabled = dirty || busy || fileLoading || !!capability.preparing || !capability.canDownloadIcon;
    window.dispatchEvent(new CustomEvent('wf-settings-actions-change'));
  }
  function syncPreview() {
    const media = sources(draft); setImage(logoPreview, media.logo); setImage(iconPreview, media.icon);
    previewName.textContent = cleanName(nameInput.value) || DEFAULT_NAME; previewName.title = previewName.textContent;
    radios.forEach(input => { input.checked = input.value === draft.installIconMode; });
    updateBusy();
  }
  function changeDraft() { dirty = true; announce('unsaved'); syncPreview(); }
  function cancelUpload() { uploadRevision++; fileLoading = false; logoInput.value = ''; iconInput.value = ''; }
  function reloadDraft() { if (busy) return; cancelUpload(); draft = manager.current(); nameInput.value = draft.name; dirty = false; syncPreview(); }
  function getSettingsActions() {
    if (!document.getElementById('page-settings')?.classList.contains('active') || panel.hidden || panel.style.display === 'none') return null;
    const host = document.getElementById('wfSettingsDialog');
    if (host && !host.open) return null;
    const stored = manager.current(), values = {...draft, name: cleanName(nameInput.value)};
    const changed = ['name', 'logo', 'installIcon', 'installIconMode'].some(key => values[key] !== stored[key]);
    return {key: 'app-identity', scope: panel, save, cancel: discard, dirty: changed, busy: busy || fileLoading};
  }
  function sameSource(img, source) { try { return img.src === new URL(source, document.baseURI).href; } catch (_) { return false; } }
  function setImage(img, source) { if (!sameSource(img, source)) img.src = source; }
  async function readImage(file, square) {
    validateFile(file); const url = URL.createObjectURL(file);
    try {
      const img = new Image(); await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('imageInvalid')); img.src = url; });
      if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth * img.naturalHeight > 24000000) throw new Error('imageInvalid');
      const canvas = document.createElement('canvas'), scale = Math.min(1, (square ? 432 : 720) / Math.max(img.naturalWidth, img.naturalHeight));
      const width = Math.max(1, Math.round(img.naturalWidth * scale)), height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.width = square ? 512 : width; canvas.height = square ? 512 : height;
      const context = canvas.getContext('2d'); if (!context) throw new Error('imageInvalid');
      if (square) { context.fillStyle = '#ffffff'; context.fillRect(0, 0, 512, 512); }
      context.drawImage(img, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      const result = canvas.toDataURL('image/png'); if (!cleanImage(result)) throw new Error('imageInvalid'); return result;
    } finally { URL.revokeObjectURL(url); }
  }
  for (const [input, key] of [[logoInput, 'logo'], [iconInput, 'installIcon']]) input.addEventListener('change', async () => {
    const file = input.files?.[0]; if (!file || busy) return;
    const revision = ++uploadRevision; fileLoading = true; updateBusy(); announce('loading');
    try { const result = await readImage(file, key === 'installIcon'); if (revision !== uploadRevision) return; draft[key] = result; if (key === 'installIcon') draft.installIconMode = 'custom'; changeDraft(); }
    catch (error) { if (revision === uploadRevision) announce(copy[error.message] ? error.message : 'imageInvalid', true); }
    finally { if (revision === uploadRevision) { fileLoading = false; input.value = ''; updateBusy(); } }
  });
  nameInput.addEventListener('input', () => { draft.name = nameInput.value; changeDraft(); });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || fileLoading || !form.reportValidity()) return;
    draft.name = nameInput.value; busy = true; updateBusy(); announce('saving');
    try {
      draft = await manager.save(draft); dirty = false; nameInput.value = draft.name; apply(); syncPreview(); announce('saved');
      const result = await applyInstallation(true);
      if (result?.mode === 'static-fallback' && result.custom) announce('installFallback');
    } catch (error) { announce(copy[error.message] ? error.message : 'failed', true); }
    finally { busy = false; updateBusy(); }
  });
  const failedSources = new Set();
  function paintImage(img, source) {
    const actual = failedSources.has(source) ? DEFAULT_LOGO : source;
    img.alt = '';
    img.onerror = () => { if (actual !== DEFAULT_LOGO) { failedSources.add(actual); queueApply(); } };
    setImage(img, actual);
  }
  function setName(host, name, accentTag) {
    if (!host) return;
    host.dir = 'auto'; host.title = name; host.setAttribute('aria-label', name);
    if (host.textContent !== name) { const accent = node(accentTag, '', name); host.replaceChildren(accent); }
  }
  let queued = false, installerReady = false, installSignature = '', installPromise = Promise.resolve(null);
  function applyInstallation(force = false) {
    if (!installerReady || !window.wfInstallIdentity?.apply) return Promise.resolve(null);
    const value = manager.current(), signature = JSON.stringify(value);
    if (!force && signature === installSignature) return installPromise;
    installSignature = signature;
    installPromise = Promise.resolve().then(() => window.wfInstallIdentity.apply(state().settings)).catch(() => { installSignature = ''; return null; });
    return installPromise;
  }
  function apply() {
    const identity = manager.current(), media = sources(identity);
    document.documentElement.classList.add('wf-app-identity-active');
    const navLogo = document.getElementById('navLogo');
    const wordmark = document.querySelector('.navbar .wf-nav-wordmark');
    // Keep the real logo with the visible home identity; the former logo
    // wrapper is hidden by the shared mobile/desktop navigation layout.
    if (navLogo && wordmark && navLogo.parentElement !== wordmark) wordmark.append(navLogo);
    if (navLogo) { let image = navLogo.querySelector('img'); if (!image) { image = node('img'); navLogo.replaceChildren(image); } paintImage(image, media.logo); }
    for (const id of ['wfSidebarLogo', 'about-app-logo']) { const image = document.getElementById(id); if (image) paintImage(image, media.logo); }
    setName(document.querySelector('.navbar .wf-nav-wordmark > bdi'), identity.name, 'strong');
    setName(document.querySelector('#wfSidebarBrand > strong'), identity.name, 'span');
    setName(document.getElementById('navTitle'), identity.name, 'span');
    const aboutName = document.querySelector('#stab-about .wf-about-identity h2');
    if (aboutName) { aboutName.removeAttribute('data-i18n'); aboutName.removeAttribute('data-wf-ui'); setName(aboutName, identity.name, 'span'); }
    if (document.title !== identity.name) document.title = identity.name;
    applyInstallation();
  }
  function queueApply() { if (queued) return; queued = true; queueMicrotask(() => { queued = false; apply(); }); }
  function translate() { textNodes.forEach(([el, key]) => { el.textContent = t(key); }); if (statusKey) announce(statusKey, statusError); }
  function hook(name, after) { const original = window[name]; if (typeof original === 'function') window[name] = function (...args) { const result = original.apply(this, args); after(...args); return result; }; }
  window.WFAppIdentity = { apply, current: () => manager.current(), sources: () => sources(manager.current()), getSettingsActions };
  hook('switchTab', key => { panel.style.display = key === 'app-identity' ? 'block' : 'none'; tab.classList.toggle('active', key === 'app-identity'); if (key === 'app-identity' && !dirty) reloadDraft(); });
  // init() calls applyTr only after loading settings/main. Do not reset a
  // returning device's installation manifest from the initial empty defaults.
  hook('loadSettingsToForm', () => { installerReady = true; reloadDraft(); translate(); apply(); });
  hook('applyTr', () => { installerReady = true; if (!dirty) reloadDraft(); translate(); apply(); });
  for (const host of [document.getElementById('navLogo'), document.getElementById('navTitle'), document.querySelector('.navbar .wf-nav-wordmark'), document.getElementById('wfSidebarBrand'), document.querySelector('#stab-about .wf-about-identity')]) {
    if (host) new MutationObserver(queueApply).observe(host, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['src'] });
  }
  new MutationObserver(translate).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  window.addEventListener('load', () => { apply(); updateBusy(); }, { once: true });
  window.addEventListener('wf-install-identity-change', updateBusy);
  reloadDraft(); translate(); apply();
})();
