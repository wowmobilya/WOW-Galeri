(function (root) {
  'use strict';
  const doc = root.document, push = root.WFPush;
  if (!push || !doc) return;
  const languages = ['ar', 'en', 'tr', 'fr', 'ru'];
  const words = {
    title: ['إشعارات هذا الجهاز','Notifications on this device','Bu cihazın bildirimleri','Notifications sur cet appareil','Уведомления на этом устройстве'],
    intro: ['استلم تفاصيل البروفرما والدفعات ومصروفات الصندوق حتى عندما يكون WOW مغلقًا. قد تظهر المبالغ والأسماء على شاشة القفل.','Receive proforma, payment and cash expense details even when WOW is closed. Amounts and names may appear on your lock screen.','WOW kapalıyken de proforma, ödeme ve kasa giderlerinin ayrıntılarını alın. Tutarlar ve adlar kilit ekranında görünebilir.','Recevez les détails des pro forma, des paiements et des dépenses de caisse même quand WOW est fermé. Les montants et les noms peuvent apparaître sur l’écran verrouillé.','Получайте сведения о проформах, платежах и расходах кассы, даже когда WOW закрыт. Суммы и имена могут отображаться на экране блокировки.'],
    account: ['سجّل الدخول بحساب سحابي مخوّل لتفعيل إشعاراته على هذا الجهاز.','Sign in with an eligible cloud account to enable notifications on this device.','Bu cihazda bildirimleri açmak için yetkili bir bulut hesabıyla giriş yapın.','Connectez-vous avec un compte cloud autorisé pour activer les notifications sur cet appareil.','Войдите в облачную учётную запись с доступом к уведомлениям.'],
    shared: ['استلم تنبيهات المحادثات والطلبات والمخزون المتاحة لحسابك حتى عندما يكون WOW مغلقًا. افتح التطبيق للاطّلاع على التفاصيل.','Receive alerts for your conversations, orders and gallery stock while WOW is closed. Open the app to see the details.','WOW kapalıyken hesabınızın erişebildiği sohbet, sipariş ve stok bildirimlerini alın. Ayrıntılar için uygulamayı açın.','Recevez les alertes des conversations, commandes et stocks accessibles à votre compte, même si WOW est fermé. Ouvrez l’application pour les détails.','Получайте уведомления о доступных вам чатах, заказах и остатках, даже когда WOW закрыт. Подробности доступны в приложении.'],
    connect: ['فتح إعدادات السحابة','Open cloud settings','Bulut ayarlarını aç','Ouvrir les réglages du cloud','Открыть настройки облака'],
    install: ['على iPhone أو iPad بنظام 16.4 أو أحدث، اختر «إضافة إلى الشاشة الرئيسية» من قائمة المشاركة. افتح WOW من أيقونته ثم فعّل الإشعارات هنا.','On iPhone or iPad with iOS or iPadOS 16.4 or later, choose Add to Home Screen from Share. Open WOW from its icon and enable notifications here.','iOS veya iPadOS 16.4 ve üzeri cihazlarda Paylaş menüsünden Ana Ekrana Ekle’yi seçin. WOW’u simgesinden açıp bildirimleri buradan etkinleştirin.','Sur iPhone ou iPad sous iOS ou iPadOS 16.4 ou ultérieur, choisissez Sur l’écran d’accueil dans le menu Partager. Ouvrez WOW depuis son icône, puis activez les notifications ici.','На iPhone или iPad с iOS или iPadOS 16.4 и новее выберите «На экран Домой» в меню «Поделиться». Откройте WOW с экрана Домой и включите уведомления.'],
    unsupported: ['يتطلب هذا الجهاز متصفحًا يدعم إشعارات الويب واتصال HTTPS.','This device needs HTTPS and a browser that supports Web Push.','Bu cihaz HTTPS ve Web Push destekleyen bir tarayıcı gerektiriyor.','Cet appareil nécessite HTTPS et un navigateur compatible avec les notifications web.','Для этого устройства нужны HTTPS и браузер с поддержкой веб-уведомлений.'],
    denied: ['اسمح بإشعارات WOW من إعدادات المتصفح أو الجهاز، ثم ارجع واضغط «تحقّق مجددًا».','Allow WOW notifications in your browser or device settings, then return and check again.','Tarayıcı veya cihaz ayarlarında WOW bildirimlerine izin verip buraya dönün ve tekrar kontrol edin.','Autorisez les notifications de WOW dans les réglages du navigateur ou de l’appareil, puis revenez vérifier.','Разрешите уведомления WOW в настройках устройства или браузера и повторите проверку.'],
    checking: ['جارٍ التحقق من حالة الجهاز…','Checking this device…','Cihaz kontrol ediliyor…','Vérification de cet appareil…','Проверяем устройство…'],
    ready: ['جاهز للتفعيل. اضغط الزر واسمح بإشعارات WOW عندما يطلب جهازك ذلك.','Ready to enable. Tap the button and allow WOW notifications when your device asks.','Etkinleştirmeye hazır. Düğmeye dokunun ve cihazınız sorunca WOW bildirimlerine izin verin.','Prêt à activer. Appuyez sur le bouton et autorisez les notifications WOW à la demande de votre appareil.','Всё готово. Нажмите кнопку и разрешите уведомления WOW по запросу устройства.'],
    enabled: ['إشعارات حسابك مفعّلة على هذا الجهاز.','Your account notifications are enabled on this device.','Hesap bildirimleriniz bu cihazda açık.','Les notifications de votre compte sont activées sur cet appareil.','Уведомления вашей учётной записи включены на этом устройстве.'],
    open: ['فتح','Open','Aç','Ouvrir','Открыть'],
    unavailable: ['إرسال الإشعارات غير متاح على الخادم حاليًا.','Push delivery is currently unavailable on the server.','Sunucuda bildirim gönderimi şu anda kullanılamıyor.','L’envoi des notifications est actuellement indisponible sur le serveur.','Отправка уведомлений на сервере сейчас недоступна.'],
    offline: ['الجهاز غير متصل بخدمة WOW. أعد التحقّق عند عودة الاتصال.','This device cannot reach WOW. Check again when the connection returns.','Bu cihaz WOW’a bağlanamıyor. Bağlantı gelince tekrar kontrol edin.','Cet appareil ne peut pas joindre WOW. Vérifiez à nouveau une fois la connexion rétablie.','Устройству не удаётся связаться с WOW. Повторите проверку после подключения.'],
    updating: ['تحديث التطبيق لم يجهز بعد. أعد فتح WOW ثم تحقّق مجددًا.','The app update is still loading. Reopen WOW and check again.','Uygulama güncellemesi yükleniyor. WOW’u yeniden açıp tekrar kontrol edin.','La mise à jour est en cours. Rouvrez WOW et vérifiez à nouveau.','Обновление приложения ещё загружается. Откройте WOW заново и повторите проверку.'],
    keyChanged: ['تغيّر مفتاح الإشعارات. أوقف التسجيل القديم ثم فعّل هذا الجهاز مجددًا.','The notification key changed. Remove the old registration, then enable this device again.','Bildirim anahtarı değişti. Eski kaydı kaldırın ve cihazı yeniden etkinleştirin.','La clé de notification a changé. Supprimez l’ancien enregistrement, puis réactivez cet appareil.','Ключ уведомлений изменился. Удалите прежнюю регистрацию и снова включите уведомления.'],
    error: ['تعذّر التحقق من تسجيل هذا الجهاز. تحقّق من الاتصال وأعد المحاولة.','Could not verify this device’s registration. Check the connection and try again.','Cihaz kaydı doğrulanamadı. Bağlantıyı kontrol edip yeniden deneyin.','Impossible de vérifier l’enregistrement de cet appareil. Vérifiez la connexion et réessayez.','Не удалось проверить регистрацию устройства. Проверьте подключение и попробуйте ещё раз.'],
    enable: ['تفعيل إشعارات هذا الجهاز','Enable on this device','Bu cihazda etkinleştir','Activer sur cet appareil','Включить на этом устройстве'],
    disable: ['إيقاف إشعارات هذا الجهاز','Turn off on this device','Bu cihazda kapat','Désactiver sur cet appareil','Отключить на этом устройстве'],
    test: ['إرسال إشعار تجريبي','Send a test notification','Test bildirimi gönder','Envoyer une notification test','Отправить тестовое уведомление'],
    retry: ['تحقّق مجددًا','Check again','Tekrar kontrol et','Vérifier à nouveau','Проверить ещё раз'],
    testQueued: ['طُلب إرسال إشعار تجريبي إلى هذا الجهاز.','A test notification was requested for this device.','Bu cihaz için test bildirimi istendi.','Un envoi de test a été demandé pour cet appareil.','Запрошена отправка тестового уведомления на это устройство.'],
    disabled: ['أُزيل تسجيل الإشعارات وسجلّها من هذا الجهاز.','The notification registration and history were removed from this device.','Bildirim kaydı ve geçmişi bu cihazdan kaldırıldı.','L’enregistrement et l’historique des notifications ont été supprimés de cet appareil.','Регистрация и история уведомлений удалены с этого устройства.'],
    permission: ['يحتاج التفعيل إلى إذن الإشعارات من جهازك.','This device needs your permission to enable notifications.','Bildirimler için cihazda izin vermeniz gerekiyor.','Vous devez autoriser les notifications sur cet appareil.','Разрешите уведомления на этом устройстве.'],
    failed: ['تعذّر إكمال الطلب.','The request could not be completed.','İstek tamamlanamadı.','La demande n’a pas abouti.','Не удалось выполнить запрос.'],
    history: ['آخر الإشعارات المستلمة','Recently received','Son alınan bildirimler','Notifications reçues récemment','Последние уведомления'],
    empty: ['لم يصل أي إشعار إلى هذا الجهاز بعد.','No notifications have reached this device yet.','Bu cihaza henüz bildirim ulaşmadı.','Cet appareil n’a encore reçu aucune notification.','На это устройство ещё не поступали уведомления.']
  };
  const locale = () => { const lang = doc.documentElement.lang?.toLowerCase().split(/[-_]/)[0]; return languages.includes(lang) ? lang : 'ar'; };
  const text = key => words[key]?.[languages.indexOf(locale())] || '';
  function node(tag, className) { const el = doc.createElement(tag); if (className) el.className = className; return el; }
  function mount(host, inbox) {
    const section = node('section', 'wf-push-card'), title = node(inbox ? 'h2' : 'h3'), intro = node('p'), status = node('p','wf-push-status');
    title.id = inbox ? 'wfPushPhoneTitle' : 'wfPushCloudTitle'; section.setAttribute('aria-labelledby', title.id);
    status.setAttribute('role', 'status');
    const bar = node('div', 'wf-push-actions'), buttons = {};
    function action(key, handler, primary = false) {
      const button = node('button', primary ? 'btn btn-p' : 'btn'); button.type = 'button'; button.addEventListener('click', handler); bar.append(button); buttons[key] = button;
    }
    action('enable', push.enable, true); action('test', push.test); action('disable', push.disable); action('retry', push.refresh);
    if (inbox) action('connect', () => root.WFCloudSettings?.open());
    section.append(title, intro, status, bar); host.append(section);
    let history, heading, list, empty, previous;
    if (inbox) {
      history = node('section', 'wf-push-inbox'); heading = node('h2'); heading.id = 'wfPushInboxTitle'; history.setAttribute('aria-labelledby', heading.id);
      list = node('ol'); empty = node('p'); history.append(heading, empty, list); host.append(history);
    }
    return state => {
      title.textContent = text('title'); intro.textContent = text(state.owner?'intro':'shared'); status.textContent = [text(state.status), text(state.feedback)].filter(Boolean).join(' ');
      const visible = {enable: state.status === 'ready', test: state.status === 'enabled', disable: state.bound || state.status === 'keyChanged',
        retry: ['denied','updating','offline','unavailable','error'].includes(state.status), connect: state.status === 'account' && !!root.WFCloudSettings && (!root.WFAccountAccess?.hasAccounts?.() || root.WFAccountAccess.can('settings.view'))};
      for (const [key, button] of Object.entries(buttons)) { button.textContent = text(key); button.hidden = !visible[key]; button.disabled = state.busy || !visible[key]; }
      if (!history) return;
      history.hidden = !state.bound; heading.textContent = text('history'); empty.textContent = text('empty'); empty.hidden = state.entries.length > 0;
      const signature = JSON.stringify([locale(), state.selected, state.entries.map(entry => entry.eventId)]);
      if (signature === previous) return; previous = signature;
      list.replaceChildren();
      const formatter = new Intl.DateTimeFormat(locale(), {dateStyle:'medium', timeStyle:'short'});
      for (const item of state.entries) {
        const row = node('li'), name = node('h3'), detail = node('p'), time = node('time'); name.textContent = item.title; detail.textContent = item.body;
        row.lang = item.language; row.dir = item.language === 'ar' ? 'rtl' : 'ltr';
        time.dateTime = new Date(item.timestamp).toISOString(); time.textContent = formatter.format(item.timestamp);
        if (item.eventId === state.selected) row.setAttribute('aria-current', 'true');
        row.append(time, name, detail);
        if(item.route && item.route!=='notifications'){
          const open=node('button','btn');open.type='button';open.textContent=text('open');open.addEventListener('click',()=>{push.openEntry(item.eventId);});row.append(open);
        }
        list.append(row);
      }
    };
  }
  function bind() {
    const views = [], bell = doc.querySelector('#page-notifications .wf-notifications-body'), cloud = doc.getElementById('stab-cloud');
    if (bell) { bell.querySelector('.wf-notifications-empty')?.remove(); views.push(mount(bell, true)); }
    if (cloud) views.push(mount(cloud, false));
    const draw = state => views.forEach(view => view(state)); draw(push.getSnapshot()); push.subscribe(draw);
    if (root.MutationObserver) new root.MutationObserver(() => draw(push.getSnapshot())).observe(doc.documentElement, {attributes:true, attributeFilter:['lang']});
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', bind, {once: true}); else bind();
})(typeof window === 'object' ? window : globalThis);
