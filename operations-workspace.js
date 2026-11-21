/* Native WOW destinations for printing, production, costing and records.
   The shell owns navigation only. Each feature owns its data and page body. */
(function (root) {
  'use strict';
  const document = root.document;
  if (!document || root.WFOperations || typeof root.showPage !== 'function') return;
  const main = document.getElementById('mainContent');
  const nav = document.getElementById('wf-nav-main');
  if (!main || !nav) return;
  const locales = ['ar', 'tr', 'en', 'fr', 'ru'];
  const names = {
    'package-labels': {ar:'إتيكيت الطرود',tr:'Koli etiketleri',en:'Package labels',fr:'Étiquettes de colis',ru:'Этикетки упаковок'},
    'product-costs': {ar:'كلفة المنتجات',tr:'Ürün maliyetleri',en:'Product costs',fr:'Coût des produits',ru:'Себестоимость товаров'},
    'invoice-archive': {ar:'أرشيف الفواتير',tr:'Fatura arşivi',en:'Invoice archive',fr:'Archives des factures',ru:'Архив счетов'},
    'manufacturing': {ar:'بطاقات التصنيع',tr:'Üretim fişleri',en:'Manufacturing tickets',fr:'Fiches de fabrication',ru:'Производственные задания'},
    'material-library': {ar:'مكتبة المواد والخامات',tr:'Malzeme kütüphanesi',en:'Material library',fr:'Bibliothèque des matières',ru:'Библиотека материалов'},
    'cost-analysis': {ar:'تحليل الكلفة والربح',tr:'Maliyet ve kâr analizi',en:'Cost and profit analysis',fr:'Analyse des coûts et des bénéfices',ru:'Анализ себестоимости и прибыли'},
    'print-history': {ar:'سجل إعادة الطباعة',tr:'Yeniden baskı geçmişi',en:'Reprint history',fr:'Historique des réimpressions',ru:'История повторной печати'},
    'review-center': {ar:'مركز المتابعة',tr:'Kontrol merkezi',en:'Review center',fr:'Centre de suivi',ru:'Центр проверки'},
    'daily-tasks': {ar:'المهام اليومية',tr:'Günlük görevler',en:'Daily tasks',fr:'Tâches quotidiennes',ru:'Ежедневные задачи'},
    'global-search': {ar:'البحث الشامل',tr:'Genel arama',en:'Global search',fr:'Recherche globale',ru:'Общий поиск'},
    'purchase-planner': {ar:'مساعد الشراء وإعادة الطلب',tr:'Satın alma ve yeniden sipariş',en:'Purchase and reorder planner',fr:'Achats et réapprovisionnement',ru:'Планирование закупок'},
    'purchase-followup': {ar:'متابعة طلبات الموردين',tr:'Tedarikçi sipariş takibi',en:'Supplier order follow-up',fr:'Suivi des commandes fournisseurs',ru:'Контроль заказов поставщикам'}
  };
  const groupNames = {ar:'الأدوات والمتابعة',tr:'Araçlar ve takip',en:'Tools and follow-up',fr:'Outils et suivi',ru:'Инструменты и контроль'};
  const backNames = {ar:'رجوع',tr:'Geri',en:'Back',fr:'Retour',ru:'Назад'};
  const icons = {
    folder:'<path d="M3 7V5h6l2 2h10v13H3Z"/>',
    'message-circle':'<path d="M21 11a9 9 0 0 1-9 9H4l-2 2 1-7a9 9 0 1 1 18-4Z"/><path d="M7 10h10M7 14h6"/>',
    wallet:'<path d="M4 6V4h15v4M3 8h18v12H3Z"/><path d="M21 12h-6v5h6M17 14h1"/>',
    users:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-4a6 6 0 0 1 12 0v4M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5v2"/>',
    coins:'<ellipse cx="9" cy="6" rx="6" ry="3"/><path d="M3 6v8c0 4 12 4 12 0V6M3 10c0 4 12 4 12 0M17 10c5 0 5 6 0 6m4-3v5c0 3-8 4-11 2"/>',
    settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
    images:'<rect x="5" y="3" width="16" height="15" rx="2"/><path d="M2 7v14h15M5 14l5-5 4 4 3-3 4 4"/><circle cx="16" cy="7" r="1"/>',
    'clipboard-list':'<rect x="5" y="4" width="14" height="17" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 11h6M9 15h6"/>',
    'package-open':'<path d="m3 8 9-4 9 4-9 4Zm0 0-2 4 9 4 2-4 2 4 9-4-2-4M4 14v6l8 3 8-3v-6M12 12v11"/>',
    'sliders-horizontal':'<path d="M3 6h18M3 12h18M3 18h18M8 3v6M16 9v6M9 15v6"/>',
    package:'<path d="m3 7 9-4 9 4v10l-9 4-9-4Zm0 0 9 5 9-5M12 12v9M7.5 5l9 4"/>',
    label:'<path d="M3 3h8l10 10-8 8L3 11Z"/><circle cx="7" cy="7" r="1"/>',
    cost:'<rect x="5" y="2" width="14" height="20" rx="3"/><path d="M8 6h8M8 11h1m4 0h3m-8 4h1m4 0h3m-8 4h1m4 0h3"/>',
    archive:'<rect x="3" y="3" width="18" height="4" rx="1"/><path d="M5 7v14h14V7M9 11h6"/>',
    factory:'<path d="M3 21V10l6 3V8l6 3V3h5l1 18Zm4-4h1m4 0h1m4 0h1"/>',
    material:'<path d="m3 7 9-4 9 4-9 4Zm0 5 9 4 9-4M3 17l9 4 9-4"/>',
    chart:'<path d="M4 3v18h17M8 17v-4m5 4V9m5 8V5"/>',
    print:'<path d="M7 8V3h10v5M7 17H3V9h18v8h-4M7 14h10v7H7Z"/><path d="M17 11h1"/>',
    search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    save:'<path d="M5 3h12l4 4v14H3V3Zm2 0v6h10V3M7 21v-8h10v8"/>',
    restore:'<path d="M3 10a9 9 0 1 1 1 8M3 4v6h6M12 7v5l3 2"/>',
    eye:'<path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    review:'<path d="m3 6 2 2 4-4m3 2h9M3 13h6m3 0h9M3 20h6m3 0h9"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-14 5 3 3 7-5"/>',
    close:'<path d="m6 6 12 12M18 6 6 18"/>',
    invoice:'<path d="M14 3H5a1 1 0 0 0-1 1v16h16V9Zm0 0v6h6M8 13h8m-8 4h6"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>'
  };
  const state = () => typeof S === 'object' ? S : {};
  const locale = () => locales.includes(document.documentElement.lang) ? document.documentElement.lang : locales.includes(state().lang) ? state().lang : 'ar';
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const icon = name => '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (icons[name] || icons.package) + '</svg>';
  const current = () => document.querySelector('.page.active')?.id.slice(5) || 'dashboard';
  const registry = new Map(), links = new Map();
  const group = make('div', 'wf-nav-group wf-ops-nav');
  group.setAttribute('role', 'group'); group.setAttribute('aria-labelledby', 'wfOperationsNavTitle');
  const groupTitle = make('div', 'side-sec'); groupTitle.id = 'wfOperationsNavTitle';
  group.append(groupTitle);
  for (const [id, title] of Object.entries(names)) {
    const link = make('button', 'nav-item'); link.type = 'button'; link.dataset.page = id;
    const symbol = make('span', 'nav-icon'); symbol.innerHTML = icon({'package-labels':'label','product-costs':'cost','invoice-archive':'archive','manufacturing':'factory','material-library':'material','cost-analysis':'chart','print-history':'print','review-center':'review','daily-tasks':'calendar','global-search':'search','purchase-planner':'package','purchase-followup':'review'}[id]);
    const caption = make('span'); link.append(symbol, caption);
    // The shared sidebar search invokes the original item's onclick handler.
    link.onclick = () => open(id);
    links.set(id, {link, caption, title}); group.append(link);
  }
  // Appended after the existing navigation items so legacy numeric indices stay valid.
  nav.append(group);

  function translate() {
    const lang = locale(); groupTitle.textContent = groupNames[lang];
    const toggle = group.querySelector('.wf-group-toggle');
    if (toggle) { const label = toggle.querySelector('span'); if (label) label.textContent = groupNames[lang]; }
    for (const {link, caption, title} of links.values()) {
      caption.textContent = title[lang]; link.title = title[lang]; link.setAttribute('aria-label', title[lang]);
    }
    for (const label of document.querySelectorAll('[data-wf-ops-label]')) {
      const value = names[label.dataset.wfOpsLabel]?.[lang];
      if (value) label.textContent = value;
    }
    for (const entry of registry.values()) {
      entry.page.lang = lang; entry.page.dir = lang === 'ar' ? 'rtl' : 'ltr';
      entry.title.textContent = entry.definition.title?.[lang] || names[entry.id][lang];
      entry.subtitle.textContent = entry.definition.subtitle?.[lang] || '';
      entry.subtitle.hidden = !entry.subtitle.textContent;
      entry.backCaption.textContent = backNames[lang]; entry.back.setAttribute('aria-label', backNames[lang]);
      entry.backIcon.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="'+(lang==='ar'?'M5 12h14m-6-6 6 6-6 6':'M19 12H5m6-6-6 6 6 6')+'"/></svg>';
      entry.backIcon.dataset.direction=lang==='ar'?'right':'left';
      entry.definition.onLanguage?.();
    }
  }
  function sync() {
    const id = current();
    for (const [key, {link}] of links) {
      link.classList.toggle('active', key === id);
      if (key === id) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    }
  }
  function register(definition) {
    const id = definition.id;
    if (!Object.hasOwn(names, id)) {
      if (!/^[a-z][a-z0-9-]{1,50}$/.test(id) || !root.WFAccountPolicy?.permissionForRoute(id) ||
          !definition.title || typeof definition.title.en !== 'string') throw new Error('Unknown operations page');
      names[id]=definition.title;
    }
    if (registry.has(id)) return registry.get(id);
    const page = make('section', 'page wf-ops-page'); page.id = 'page-' + id;
    const header = make('header', 'sct-sticky-header wf-heading-row');
    const back = make('button', 'sct-back-btn'); back.type = 'button';
    const backIcon=make('span','wf-ui-icon');backIcon.dataset.wfBackIcon='';backIcon.dataset.wfUiIcon='back';backIcon.setAttribute('aria-hidden','true');
    const backCaption=make('span');back.append(backIcon,backCaption);
    back.addEventListener('click', () => root.showPage(definition.parent || 'dashboard'));
    const heading = make('div', 'sct-sticky-title wf-centered-heading');
    const title = make('h1'); title.id = 'wfOpsTitle-' + id; title.tabIndex = -1;
    page.setAttribute('aria-labelledby', title.id);
    const subtitle = make('p'); heading.append(title, subtitle);
    const menu = make('button', 'wf-section-menu'); menu.type = 'button'; menu.innerHTML = icon('menu');
    menu.setAttribute('aria-controls','sidebar'); menu.setAttribute('aria-expanded','false');
    menu.addEventListener('click', () => root.wfToggleDesktopSidebar?.());
    const actions = make('div', 'wf-heading-actions wf-ops-actions');
    header.append(back, heading, menu, actions);
    const body = make('div', 'wf-ops-body'); page.append(header, body); main.append(page);
    const entry = {id, definition, page, header, actions, body, title, subtitle, back, backIcon, backCaption};
    registry.set(id, entry);
    const lang = locale(); page.lang = lang; page.dir = lang === 'ar' ? 'rtl' : 'ltr';
    title.textContent = definition.title?.[lang] || names[id][lang];
    subtitle.textContent = definition.subtitle?.[lang] || ''; subtitle.hidden = !subtitle.textContent;
    backCaption.textContent = backNames[lang];back.setAttribute('aria-label',backNames[lang]);
    backIcon.innerHTML='<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="'+(lang==='ar'?'M5 12h14m-6-6 6 6-6 6':'M19 12H5m6-6-6 6 6 6')+'"/></svg>';backIcon.dataset.direction=lang==='ar'?'right':'left';
    return entry;
  }
  function open(id) {
    if (!registry.has(id)) return false;
    root.showPage(id); return true;
  }
  const originalShowPage = root.showPage;
  root.showPage = function (id, pushHistory = true) {
    if(id!=='package-labels')root.WFPackageLabels?.closeProfilePicker?.();
    const result = originalShowPage.apply(this, arguments);
    sync();
    const entry = registry.get(id);
    if (entry && current() === id) entry.definition.onEnter?.();
    return result;
  };
  function handleHistory(event) {
    if(root.WFPackageLabels?.handleHistory?.(event))return true;
    // The original app owns closing its invoice preview and mobile drawer first.
    if(document.querySelector('.modal-ov.open')||document.getElementById('sidebar')?.classList.contains('open'))return false;
    const from = current();
    const hash = root.location.hash.slice(1);
    const target = [hash, event?.state?.page, hash ? '' : 'dashboard'].find(id =>
      typeof id === 'string' && id && document.getElementById('page-' + id));
    if (!target || (!registry.has(from) && !registry.has(target))) return false;
    event?.stopImmediatePropagation();
    if (from !== target) root.showPage(target, false);
    return true;
  }
  // The inline router also delegates here before its hierarchical Back fallback.
  root.addEventListener('popstate', handleHistory, true);
  root.addEventListener('hashchange', () => {
    const from = current(), target = root.location.hash.slice(1);
    if (from !== target && from !== 'notifications' && target !== 'notifications') handleHistory();
  });
  new root.MutationObserver(() => translate()).observe(document.documentElement, {attributes:true, attributeFilter:['lang']});
  root.WFOperations = {
    register, open, state, locale, make, icon, handleHistory,
    refresh() { registry.get(current())?.definition.onEnter?.(); },
    notify(message, type = 'ok') { root.showToast?.(message, type); },
    label(id) { return names[id]?.[locale()] || ''; }
  };
  function enhanceProducts() {
    for (const card of document.querySelectorAll('#prGrid .pr-card-new[data-product-id]')) {
      const actions = card.querySelector('.pr-card-new-actions');
      if (!actions || actions.querySelector('[data-wf-cost-action]')) continue;
      const action = make('button', 'btn btn-s'); action.type='button'; action.dataset.wfCostAction='';
      const symbol=make('span','wf-ops-icon'); symbol.innerHTML=icon('cost');
      const caption=make('span','',names['product-costs'][locale()]); caption.dataset.wfOpsLabel='product-costs';
      action.append(symbol,caption);
      action.addEventListener('click',event=>{event.stopPropagation();root.WFCosting?.open(card.dataset.productId);});
      actions.append(action);
    }
  }
  const products=document.getElementById('prGrid');
  if(products)new root.MutationObserver(enhanceProducts).observe(products,{childList:true});
  const productToolbar=document.querySelector('#page-products .co-toolbar-row');
  if(productToolbar){
    const action=make('button','btn btn-s');action.type='button';action.id='wfProductCostsOpen';
    const symbol=make('span','wf-ops-icon');symbol.innerHTML=icon('cost');
    const caption=make('span','',names['product-costs'][locale()]);caption.dataset.wfOpsLabel='product-costs';
    action.append(symbol,caption);action.addEventListener('click',()=>root.WFCosting?.open());productToolbar.append(action);
  }
  enhanceProducts();
  translate();
})(typeof window === 'object' ? window : globalThis);
