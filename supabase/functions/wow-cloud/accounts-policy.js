/* Local account permissions. Unknown sections, actions and routes fail closed.
 * This policy controls application capabilities; session/password validation
 * and expiry belong to the account service, which provides the current actor. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WFAccountPolicy = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function titles(ar, en, tr, fr, ru) { return Object.freeze({ar, en, tr, fr, ru}); }
  function section(id, caption, actions, ownerOnly) {
    return Object.freeze({id, titles:caption, actions:Object.freeze(actions), ownerOnly:!!ownerOnly});
  }
  const actions = Object.freeze([
    {id:'view', titles:titles('عرض', 'View', 'Görüntüleme', 'Consulter', 'Просмотр')},
    {id:'edit', titles:titles('إضافة وتعديل', 'Add and edit', 'Ekleme ve düzenleme', 'Ajouter et modifier', 'Добавление и изменение')},
    {id:'delete', titles:titles('حذف', 'Delete', 'Silme', 'Supprimer', 'Удаление')},
    {id:'print', titles:titles('طباعة', 'Print', 'Yazdırma', 'Imprimer', 'Печать')},
    {id:'export', titles:titles('تصدير ومشاركة', 'Export and share', 'Dışa aktarma ve paylaşma', 'Exporter et partager', 'Экспорт и отправка')}
  ].map(Object.freeze));

  // Only capabilities implemented by the corresponding workspace are offered.
  // Cross-workspace links still require the destination's own permission.
  const sections = Object.freeze([
    section('customers', titles('العملاء', 'Customers', 'Müşteriler', 'Clients', 'Клиенты'), ['view','edit','delete']),
    section('products', titles('المنتجات', 'Products', 'Ürünler', 'Produits', 'Товары'), ['view','edit','delete','print']),
    section('invoices', titles('الفواتير', 'Invoices', 'Faturalar', 'Factures', 'Счета'), ['view','edit','delete','print','export']),
    section('manufacturing', titles('التصنيع', 'Manufacturing', 'Üretim', 'Fabrication', 'Производство'), ['view','edit','print']),
    section('tasks', titles('المهام اليومية', 'Daily tasks', 'Günlük görevler', 'Tâches quotidiennes', 'Ежедневные задачи'), ['view','edit','delete']),
    section('labels', titles('ملصقات الطرود', 'Package labels', 'Koli etiketleri', 'Étiquettes de colis', 'Этикетки упаковок'), ['view','print']),
    section('materials', titles('مكتبة المواد', 'Material library', 'Malzeme kütüphanesi', 'Bibliothèque de matériaux', 'Библиотека материалов'), ['view','edit']),
    section('costs', titles('تكاليف المنتجات وتحليلها', 'Product costs and analysis', 'Ürün maliyetleri ve analizi', 'Coûts et analyse des produits', 'Себестоимость и анализ'), ['view','edit']),
    section('purchasing', titles('المشتريات والمتابعة', 'Purchasing and follow-up', 'Satın alma ve takip', 'Achats et suivi', 'Закупки и отслеживание'), ['view','edit','print','export']),
    section('payments', titles('الدفعات وكشوف الحساب', 'Payments and statements', 'Ödemeler ve hesap ekstreleri', 'Paiements et relevés', 'Платежи и выписки'), ['view','edit','delete','print','export']),
    section('reports', titles('التقارير المالية ولوحة المعلومات', 'Financial reports and dashboard', 'Finansal raporlar ve gösterge paneli', 'Rapports financiers et tableau de bord', 'Финансовые отчёты и обзор'), ['view']),
    section('archives', titles('أرشيف الفواتير', 'Invoice archive', 'Fatura arşivi', 'Archives des factures', 'Архив счетов'), ['view','edit']),
    section('history', titles('سجل الطباعة', 'Print history', 'Yazdırma geçmişi', 'Historique d’impression', 'История печати'), ['view','edit']),
    section('search', titles('البحث الشامل', 'Global search', 'Genel arama', 'Recherche globale', 'Общий поиск'), ['view']),
    section('review', titles('مركز المراجعة', 'Review center', 'İnceleme merkezi', 'Centre de vérification', 'Центр проверки'), ['view']),
    section('gallery', titles('المعرض', 'Gallery', 'Galeri', 'Galerie', 'Галерея'), ['view','edit','delete','print','export']),
    section('orders', titles('طلبات المعرض', 'Gallery orders', 'Galeri siparişleri', 'Commandes de la galerie', 'Заказы галереи'), ['view','edit','delete','print','export']),
    section('myorders', titles('طلباتي ومبيعاتي', 'My orders and sales', 'Siparişlerim ve satışlarım', 'Mes commandes et ventes', 'Мои заказы и продажи'), ['view','edit','print','export']),
    section('chat', titles('المحادثات', 'Conversations', 'Sohbetler', 'Conversations', 'Переписка'), ['view','edit','delete']),
    section('communications', titles('مراسلات العملاء', 'Customer communications', 'Müşteri yazışmaları', 'Correspondance client', 'Сообщения клиентам'), ['view','edit','delete','export']),
    section('files', titles('ملفاتي', 'My files', 'Dosyalarım', 'Mes fichiers', 'Мои файлы'), ['view','edit','delete','export']),
    section('finance', titles('المحاسبة', 'Accounting', 'Muhasebe', 'Comptabilité', 'Бухгалтерия'), ['view','edit','delete','print','export']),
    section('payroll', titles('الرواتب والحضور', 'Payroll and attendance', 'Maaş ve devam', 'Paie et présence', 'Зарплата и посещаемость'), ['view','edit','delete','print','export']),
    section('metals', titles('الذهب والفضة', 'Gold and silver', 'Altın ve gümüş', 'Or et argent', 'Золото и серебро'), ['view','edit','delete','print','export']),
    section('assistant', titles('مساعد مارك ربوت', 'Mark Robot assistant', 'Mark Robot asistanı', 'Assistant Mark Robot', 'Помощник Mark Robot'), ['view']),
    section('server', titles('إدارة مارك ربوت', 'Mark Robot administration', 'Mark Robot yönetimi', 'Administration Mark Robot', 'Управление Mark Robot'), ['view','edit'], true),
    section('settings', titles('إعدادات البرنامج', 'App settings', 'Uygulama ayarları', 'Paramètres de l’application', 'Настройки приложения'), ['view','edit'], true),
    section('accounts', titles('الحسابات والصلاحيات', 'Accounts and permissions', 'Hesaplar ve izinler', 'Comptes et autorisations', 'Учётные записи и права'), ['view','edit','delete'], true),
    section('data', titles('النسخ الاحتياطي وبيانات البرنامج', 'Backups and app data', 'Yedekler ve uygulama verileri', 'Sauvegardes et données', 'Копии и данные приложения'), ['view','edit','delete','export'], true)
  ]);
  const roles = Object.freeze([
    {id:'owner', titles:titles('المالك', 'Owner', 'İşletme sahibi', 'Propriétaire', 'Владелец')},
    {id:'manager', titles:titles('مدير', 'Manager', 'Yönetici', 'Responsable', 'Руководитель')},
    {id:'sales', titles:titles('المبيعات', 'Sales', 'Satış', 'Ventes', 'Продажи')},
    {id:'carpentry', titles:titles('النجارة', 'Carpentry', 'Marangozhane', 'Menuiserie', 'Столярный цех')},
    {id:'assembly', titles:titles('التركيب والتجميع', 'Assembly / installation', 'Montaj', 'Assemblage', 'Сборка')},
    {id:'warehouse', titles:titles('المستودع', 'Warehouse', 'Depo', 'Entrepôt', 'Склад')},
    {id:'customer', titles:titles('عميل', 'Customer', 'Müşteri', 'Client', 'Клиент')},
    {id:'custom', titles:titles('مخصص', 'Custom', 'Özel', 'Personnalisé', 'Настраиваемая роль')}
  ].map(Object.freeze));
  const roleIds = new Set(roles.map(role => role.id));
  const sectionById = new Map(sections.map(entry => [entry.id, entry]));
  const permissionKeys = Object.freeze(sections.flatMap(entry => entry.actions.map(action => entry.id + '.' + action)));
  const knownPermissions = new Set(permissionKeys);
  const customerPermissions = new Set([
    'gallery.view','gallery.export','myorders.view','myorders.edit','myorders.print','myorders.export',
    'chat.view','chat.edit','chat.delete','files.view','files.edit','files.delete','files.export'
  ]);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

  function permittedForRole(role, key) {
    if (!roleIds.has(role) || !knownPermissions.has(key)) return false;
    return role === 'owner' || (!sectionById.get(key.split('.')[0]).ownerOnly &&
      (role !== 'customer' || customerPermissions.has(key)));
  }

  function normalizePermissions(role, permissions) {
    if (!roleIds.has(role)) return [];
    if (role === 'owner') return permissionKeys.slice();
    if (!Array.isArray(permissions)) return [];
    const requested = new Set(permissions.filter(key => typeof key === 'string' && knownPermissions.has(key)));
    return permissionKeys.filter(key => {
      const sectionId = key.slice(0, key.indexOf('.'));
      return permittedForRole(role, key) && requested.has(sectionId + '.view') && requested.has(key);
    });
  }

  const presetKeys = Object.freeze({
    owner:permissionKeys,
    manager:Object.freeze(permissionKeys.filter(key => !sectionById.get(key.split('.')[0]).ownerOnly)),
    sales:Object.freeze([
      'customers.view','customers.edit','products.view','products.print',
      'invoices.view','invoices.edit','invoices.print','invoices.export',
      'manufacturing.view','tasks.view','tasks.edit','labels.view','labels.print',
      'payments.view','payments.edit','payments.print','payments.export',
      'archives.view','history.view','search.view','review.view'
    ]),
    carpentry:Object.freeze(['manufacturing.view','manufacturing.edit','manufacturing.print','tasks.view','tasks.edit']),
    assembly:Object.freeze([
      'manufacturing.view','manufacturing.edit','manufacturing.print','tasks.view','tasks.edit',
      'labels.view','labels.print','history.view','history.edit'
    ]),
    warehouse:Object.freeze([
      'manufacturing.view','manufacturing.print','tasks.view','tasks.edit',
      'labels.view','labels.print','history.view','history.edit'
    ]),
    customer:Object.freeze(['gallery.view','myorders.view','myorders.edit','chat.view','chat.edit','files.view','files.edit']),
    custom:Object.freeze([])
  });
  function presets(role) {
    return roleIds.has(role) ? normalizePermissions(role, presetKeys[role]) : [];
  }

  function can(account, key) {
    if (!account || typeof account !== 'object' || !permittedForRole(account.role, key)) return false;
    if ((own(account, 'status') && account.status !== 'active') || account.enabled === false || account.disabled === true) return false;
    if (account.role === 'owner') return true;
    const sectionId = key.slice(0, key.indexOf('.'));
    if (!Array.isArray(account.permissions)) return false;
    return account.permissions.includes(sectionId + '.view') && account.permissions.includes(key);
  }

  // Kept explicit: accepting an unlisted page would expose new modules by default.
  // Manufacturing and package labels consume invoice snapshots but do not grant
  // access to the financial invoice list, preview or editor.
  const routePermissions = Object.freeze({
    dashboard:'reports.view',
    companies:'customers.view',
    products:'products.view',
    cart:'invoices.edit',
    invoices:'invoices.view',
    'add-company':'customers.edit',
    'add-product':'products.edit',
    'create-invoice':'invoices.edit',
    'select-client-type':'customers.edit',
    'select-invoice-type':'invoices.edit',
    'payment-management':'payments.view',
    cashboxes:'payments.view',
    reports:'reports.view',
    exchange:'reports.view',
    settings:'settings.view',
    'quick-barcode':'invoices.edit',
    notifications:'reports.view',
    'package-labels':'labels.view',
    'product-costs':'costs.view',
    'invoice-archive':'archives.view',
    manufacturing:'manufacturing.view',
    'material-library':'materials.view',
    'cost-analysis':'costs.view',
    'print-history':'history.view',
    'review-center':'review.view',
    'daily-tasks':'tasks.view',
    'global-search':'search.view',
    'purchase-planner':'purchasing.view',
    'purchase-followup':'purchasing.view',
    gallery:'gallery.view',
    'gallery-orders':'orders.view',
    'my-orders':'myorders.view',
    'gallery-studio':'gallery.edit',
    chat:'chat.view',
    communications:'communications.view',
    files:'files.view',
    finance:'finance.view',
    payroll:'payroll.view',
    metals:'metals.view',
    assistant:'assistant.view',
    'server-admin':'server.view'
  });
  function permissionForRoute(route) {
    if (typeof route !== 'string') return null;
    const id = route.startsWith('#') ? route.slice(1) : route;
    return own(routePermissions, id) ? routePermissions[id] : null;
  }
  function canRoute(account, route) {
    if (route === 'notifications' || route === '#notifications') return canNotifications(account);
    const key = permissionForRoute(route);
    return key !== null && can(account, key);
  }
  function canNotifications(account) {
    return ['reports.view','chat.view','gallery.view','orders.view','myorders.view'].some(key => can(account, key));
  }

  const preferredHomes = Object.freeze({owner:'dashboard', manager:'dashboard', sales:'invoices', carpentry:'manufacturing', assembly:'manufacturing', warehouse:'package-labels', customer:'gallery'});
  const homeRoutes = Object.freeze([
    'dashboard','invoices','manufacturing','package-labels','daily-tasks','companies','products',
    'material-library','purchase-planner','product-costs','payment-management','invoice-archive',
    'print-history','global-search','review-center','gallery','my-orders','gallery-orders',
    'chat','communications','files','finance','payroll','metals','assistant','server-admin','settings'
  ]);
  function safeHome(account) {
    const preferred = account && own(preferredHomes, account.role) ? preferredHomes[account.role] : null;
    if (preferred && canRoute(account, preferred)) return preferred;
    return homeRoutes.find(route => canRoute(account, route)) || null;
  }

  // A baseline for ordinary writes. Shared-record merges require the runtime to
  // compare the committed before/after fields and authorize the owning module;
  // a caller-supplied permission string is deliberately never trusted here.
  const writeSections = Object.freeze({companies:'customers', products:'products', invoices:'invoices', payments:'payments'});
  function permissionForWrite(operation) {
    if (!operation || typeof operation !== 'object') return null;
    const type = operation.type === undefined ? 'put' : operation.type;
    if (!['put','add','merge','delete'].includes(type)) return null;
    if (operation.store === 'settings') return 'settings.edit';
    if (!own(writeSections, operation.store)) return null;
    return writeSections[operation.store] + (type === 'delete' ? '.delete' : '.edit');
  }

  return Object.freeze({version:2, actions, sections, roles, permissionKeys, presets, normalizePermissions, permittedForRole, can,
    permissionForRoute, canRoute, canNotifications, safeHome, permissionForWrite});
});
