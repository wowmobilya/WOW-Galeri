(function(root,factory){
  'use strict';
  const core=factory();
  if(typeof module==='object'&&module.exports)module.exports=core;
  else root.WFAssistantCore=core;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const locales=['ar','en','tr','fr','ru'];
  const words={
    title:['مساعد مارك','Mark Assistant','Mark Asistan','Assistant Mark','Помощник Марк'],
    search:['بحث السجلات','Find records','Kayıt ara','Rechercher des fiches','Поиск записей'],
    checks:['مراجعة البيانات','Check data','Verileri denetle','Vérifier les données','Проверка данных'],
    report:['تقرير التدفق النقدي','Cash flow','Nakit akışı','Flux de trésorerie','Денежный поток'],
    chat:['ملخّص محادثة','Conversation digest','Sohbet özeti','Synthèse de discussion','Обзор беседы'],
    searchHelp:['ابحث بالاسم أو رقم السجل أو الباركود.','Search by name, record number or barcode.','Ad, kayıt numarası veya barkodla arayın.','Recherchez un nom, un numéro de fiche ou un code-barres.','Введите название, номер записи или штрихкод.'],
    checksHelp:['راجع الحقول الناقصة والباركود المكرر في السجلات التي يمكنك عرضها.','Find missing fields and shared barcodes in the records you can view.','Görüntüleyebildiğiniz kayıtlardaki eksik alanları ve ortak barkodları bulun.','Repérez les champs manquants et les codes-barres partagés dans vos fiches accessibles.','Найдите пропуски и повторяющиеся штрихкоды в доступных записях.'],
    reportHelp:['يجمع مارك حركة الصناديق من تقرير المالية لكل عملة على حدة. يشمل التحويلات بين الصناديق.','Cash movements come from Finance. Each currency is shown separately. Transfers contribute a movement in each cashbox.','Kasa hareketleri Finans raporundan alınır. Her para birimi ayrı gösterilir. Transferler iki kasaya da hareket olarak girer.','Les flux viennent du rapport financier. Chaque devise est présentée séparément. Un transfert crée un mouvement dans chaque caisse.','Данные берутся из финансового отчёта отдельно по каждой валюте. Перевод создаёт движение в обеих кассах.'],
    chatHelp:['اختر محادثة لمراجعة أحدث الرسائل النصية المرئية. يعرض مارك حتى ١٢ مقتطفًا من الصفحة الأخيرة.','Choose a conversation to review up to 12 visible text excerpts from its latest page.','Son sayfadaki en fazla 12 görünür metin alıntısını incelemek için bir sohbet seçin.','Choisissez une discussion pour consulter jusqu’à 12 extraits visibles de sa dernière page.','Выберите беседу. Обзор включает до 12 доступных текстовых сообщений с последней страницы.'],
    source:['المصدر','Source','Kaynak','Source','Источник'],all:['كل المصادر المتاحة','All available sources','Tüm erişilebilir kaynaklar','Toutes les sources accessibles','Все доступные источники'],
    products:['المنتجات','Products','Ürünler','Produits','Товары'],customers:['العملاء','Customers','Müşteriler','Clients','Клиенты'],invoices:['الفواتير','Invoices','Faturalar','Factures','Счета'],
    finance:['المالية','Finance','Finans','Finances','Финансы'],query:['الاسم أو الرقم','Name or number','Ad veya numara','Nom ou numéro','Название или номер'],
    month:['الشهر','Month','Ay','Mois','Месяц'],room:['المحادثة','Conversation','Sohbet','Discussion','Беседа'],
    team:['الفريق','Team','Ekip','Équipe','Команда'],direct:['محادثة مباشرة','Direct conversation','Bire bir sohbet','Discussion directe','Личная беседа'],group:['مجموعة','Group','Grup','Groupe','Группа'],
    pick:['اختر محادثة','Choose a conversation','Sohbet seçin','Choisir une discussion','Выберите беседу'],
    run:['اعرض الأدلة','Show evidence','Kaynakları göster','Afficher les sources','Показать источники'],
    evidence:['الأدلة','Evidence','Kaynaklar','Sources','Источники'],open:['افتح المصدر','Open source workspace','Kaynağı aç','Ouvrir la source','Открыть раздел'],
    more:['توجد نتائج إضافية. افتح المصدر أو ضيّق البحث.','More records are available. Open the source or narrow your search.','Başka kayıtlar da var. Kaynağı açın veya aramayı daraltın.','D’autres fiches sont disponibles. Ouvrez la source ou précisez la recherche.','Есть другие записи. Откройте источник или уточните поиск.'],
    noSearch:['لا توجد سجلات مطابقة.','No matching records.','Eşleşen kayıt yok.','Aucune fiche correspondante.','Совпадений нет.'],
    noChecks:['لم ترصد هذه الفحوص حقولًا ناقصة أو باركودًا مكررًا.','These checks found no missing fields or duplicate barcodes.','Bu denetimlerde eksik alan veya yinelenen barkod bulunmadı.','Ces vérifications n’ont relevé aucun champ manquant ni code-barres répété.','Проверка не выявила пропусков или повторяющихся штрихкодов.'],
    noReport:['لا توجد حركة نقدية مسجلة لهذا الشهر.','No cash movements were recorded for this month.','Bu ay için kasa hareketi kaydedilmemiş.','Aucun mouvement de caisse enregistré pour ce mois.','За этот месяц кассовые движения не зарегистрированы.'],
    noChat:['لا توجد مقتطفات نصية مرئية في الصفحة الأخيرة.','The latest page has no visible text excerpts.','Son sayfada görünür metin yok.','Aucun extrait visible sur la dernière page.','На последней странице нет доступных текстовых сообщений.'],
    noRooms:['لا توجد محادثات يمكنك عرضها بعد.','You have no conversations to review yet.','Henüz inceleyebileceğiniz bir sohbet yok.','Vous n’avez pas encore de discussion à consulter.','Доступных для просмотра бесед пока нет.'],
    noSource:['يحتاج حسابك إلى صلاحية لأحد المصادر لعرض الأدلة هنا.','Your account needs access to a source to display evidence here.','Burada kaynak görüntülemek için bir kaynak erişim izni gerekir.','Un accès à une source est nécessaire pour afficher des données ici.','Для просмотра данных нужен доступ хотя бы к одному источнику.'],
    record:['السجل','Record','Kayıt','Fiche','Запись'],barcode:['الباركود','Barcode','Barkod','Code-barres','Штрихкод'],
    inflow:['الوارد','Inflow','Giriş','Entrées','Поступления'],outflow:['الصادر','Outflow','Çıkış','Sorties','Выплаты'],
    net:['الصافي','Net movement','Net hareket','Flux net','Чистое движение'],entries:['الحركات','Cash movements','Kasa hareketleri','Mouvements','Операции'],
    missingReference:['أضف رقمًا للفاتورة بعد مراجعة أصلها.','Verify the original invoice and add its missing reference.','Asıl faturayı kontrol edip eksik numarasını ekleyin.','Vérifiez la facture d’origine et complétez sa référence.','Сверьтесь с оригиналом счёта и укажите номер.'],
    missingName:['تحقّق من اسم السجل وأكمله.','Verify and fill in the missing record name.','Eksik kayıt adını doğrulayıp tamamlayın.','Vérifiez et complétez le nom manquant.','Проверьте и укажите название записи.'],
    missingCustomer:['راجع الفاتورة لتأكيد اسم العميل.','Check the invoice and confirm its customer name.','Faturayı kontrol edip müşteri adını doğrulayın.','Contrôlez la facture et confirmez le nom du client.','Сверьте счёт и подтвердите имя клиента.'],
    missingType:['راجع نوع المنتج لتحسين تصنيفه.','Review the missing product type before categorizing it.','Ürünü sınıflandırmadan önce eksik türünü inceleyin.','Vérifiez le type manquant avant de classer le produit.','Уточните тип товара перед его классификацией.'],
    duplicateBarcode:['تشترك منتجات في الباركود نفسه. قارِن الملصقات قبل التعديل.','Multiple products share this barcode. Compare their labels before editing.','Bu barkod birden fazla üründe var. Düzenlemeden önce etiketleri karşılaştırın.','Plusieurs produits partagent ce code-barres. Comparez leurs étiquettes avant modification.','Несколько товаров имеют этот штрихкод. Сверьте этикетки перед правкой.'],
    netIn:['الوارد أعلى من الصادر.','Inflow exceeded outflow.','Girişler çıkışları aştı.','Les entrées ont dépassé les sorties.','Поступления превысили выплаты.'],
    netOut:['الصادر أعلى من الوارد.','Outflow exceeded inflow.','Çıkışlar girişleri aştı.','Les sorties ont dépassé les entrées.','Выплаты превысили поступления.'],
    netEven:['تساوى الوارد والصادر.','Inflow equaled outflow.','Girişler ve çıkışlar eşitti.','Les entrées ont égalé les sorties.','Поступления равны выплатам.'],
    questions:['رسائل تتضمن سؤالًا','Messages with a question','Soru içeren iletiler','Messages contenant une question','Сообщения с вопросом'],
    clipped:['مقتطف مختصر','Excerpt shortened','Alıntı kısaltıldı','Extrait abrégé','Сокращённая цитата'],
    aiOff:['الملخّص التوليدي يحتاج إلى إعداد نموذج على الخادم. يمكنك مراجعة المصادر المتاحة لحسابك.','Generative summaries need a model configured on the server. You can review the sources available to your account.','Üretken özetler için sunucuda bir model ayarlanmalıdır. Hesabınızın erişebildiği kaynakları inceleyebilirsiniz.','Les synthèses génératives nécessitent un modèle configuré sur le serveur. Vous pouvez consulter les sources accessibles à votre compte.','Для генерации нужен настроенный на сервере AI-модуль. Вы можете просматривать доступные вашему аккаунту источники.'],
    aiReady:['تم إعداد خدمة النموذج.','Model provider configured.','Model sağlayıcısı yapılandırıldı.','Fournisseur de modèle configuré.','Сервис модели настроен.'],
    verified:['آخر استجابة ناجحة لحسابك','Last successful response for your account','Hesabınız için son başarılı yanıt','Dernière réponse réussie pour votre compte','Последний успешный ответ для вашего аккаунта'],
    quota:['طلبات اليوم بتوقيت UTC','Requests today in UTC','Bugünkü istekler (UTC)','Requêtes du jour en UTC','Запросы за сегодня по UTC'],
    focus:['التركيز المطلوب (اختياري)','Focus for the assistant (optional)','Asistanın odak noktası (isteğe bağlı)','Point à privilégier (facultatif)','На чём сосредоточиться (необязательно)'],
    send:['حلّل المصادر المحددة باستخدام OpenAI','Analyze selected sources with OpenAI','Seçilen kaynakları OpenAI ile incele','Analyser les sources choisies avec OpenAI','Проанализировать выбранное с OpenAI'],
    share:['يُرسل النص المحدد وطلبك إلى OpenAI عند الضغط على التحليل.','Analyzing sends the selected evidence and your focus to OpenAI.','Analiz, seçili kaynakları ve isteğinizi OpenAI’a gönderir.','L’analyse envoie les sources sélectionnées et votre consigne à OpenAI.','Для анализа выбранные источники и ваш запрос отправляются в OpenAI.'],
    selected:['المصادر المحددة','Selected sources','Seçili kaynaklar','Sources choisies','Выбранные источники'],
    summary:['مسودة ملخّص المحادثة','Draft conversation summary','Taslak sohbet özeti','Projet de synthèse','Черновик обзора беседы'],
    highlights:['الأدلة التي اختارها المساعد','Evidence selected by the assistant','Asistanın seçtiği kaynaklar','Sources retenues par l’assistant','Источники, выбранные помощником'],
    insufficient:['لم يجد المساعد أدلة كافية للتركيز المطلوب.','The assistant found insufficient evidence for this focus.','Asistan bu odak için yeterli kaynak bulamadı.','L’assistant a trouvé trop peu de sources sur ce point.','Для этого вопроса не хватило данных.'],
    loading:['جارٍ قراءة الأدلة…','Reading evidence…','Kaynaklar okunuyor…','Lecture des sources…','Загружаются источники…'],
    working:['جارٍ تحليل المصادر المحددة…','Analyzing the selected sources…','Seçili kaynaklar inceleniyor…','Analyse des sources choisies…','Анализируются выбранные источники…'],
    retry:['إعادة المحاولة','Retry','Yeniden dene','Réessayer','Повторить'],
    invalid:['تحقّق من الحقول. اكتب حرفين على الأقل عند البحث.','Check the fields. A search needs at least two characters.','Alanları kontrol edin. Arama en az iki karakter gerektirir.','Vérifiez les champs. La recherche demande au moins deux caractères.','Проверьте поля. Для поиска нужно не менее двух символов.'],
    failed:['تعذّر الوصول إلى الخادم. أعد المحاولة عند توفر الاتصال.','The server could not be reached. Retry when connected.','Sunucuya ulaşılamadı. Bağlantı gelince yeniden deneyin.','Serveur inaccessible. Réessayez une fois connecté.','Сервер недоступен. Повторите после подключения.'],
    denied:['تغيّرت صلاحية الوصول. أعد فتح القسم.','Access changed. Reopen this workspace.','Erişim değişti. Bu alanı yeniden açın.','L’accès a changé. Rouvrez cet espace.','Права доступа изменились. Откройте раздел заново.'],
    changed:['تغيّرت الأدلة. اعرض النسخة الحالية قبل التحليل.','The evidence changed. Show the current version before analyzing.','Kaynaklar değişti. Analizden önce güncel sürümü görüntüleyin.','Les sources ont changé. Affichez la version actuelle avant l’analyse.','Данные изменились. Загрузите свежие источники перед анализом.'],
    limit:['تم بلوغ الحد اليومي. تبقى الأدلة متاحة، ويتجدد الحد عند منتصف الليل UTC.','The daily request limit was reached. Evidence stays available. The limit resets at midnight UTC.','Günlük sınıra ulaşıldı. Kaynaklar açıktır. Sınır UTC gece yarısında sıfırlanır.','Limite quotidienne atteinte. Les sources restent disponibles. Le quota est réinitialisé à minuit UTC.','Достигнут дневной лимит. Данные доступны. Лимит обновится в полночь по UTC.'],
    busy:['هناك طلب جارٍ. انتظر لحظة ثم تحقق مجددًا.','A request is in progress. Wait a moment and check again.','Bir istek sürüyor. Biraz bekleyip yeniden kontrol edin.','Une requête est en cours. Patientez puis vérifiez à nouveau.','Запрос обрабатывается. Немного подождите и повторите проверку.'],
    circuit:['توقّف المزوّد مؤقتًا بعد أخطاء متكررة. أعد المحاولة بعد خمس دقائق.','Repeated provider failures paused AI requests. Retry after five minutes.','Tekrarlanan sağlayıcı hataları nedeniyle istekler duraklatıldı. Beş dakika sonra deneyin.','Des erreurs répétées ont suspendu les requêtes au modèle. Réessayez dans cinq minutes.','Из-за повторных ошибок запросы к модели приостановлены. Повторите через пять минут.'],
    upstream:['تعذّر إكمال التحليل. يمكنك بدء طلب جديد من الأدلة المعروضة.','Analysis did not finish. You can start a new request with the displayed evidence.','Analiz tamamlanamadı. Gösterilen kaynaklarla yeni bir istek başlatabilirsiniz.','L’analyse n’a pas abouti. Vous pouvez lancer une nouvelle requête avec les sources affichées.','Анализ не завершён. Можно отправить новый запрос с показанными источниками.'],
    expired:['انتهت صلاحية النتيجة. اعرض الأدلة الحالية لبدء تحليل جديد.','The result expired. Show current evidence to start a new analysis.','Sonucun süresi doldu. Yeni analiz için güncel kaynakları görüntüleyin.','Le résultat a expiré. Affichez les sources actuelles pour une nouvelle analyse.','Срок действия результата истёк. Загрузите свежие данные для нового анализа.'],
    fresh:['اعرض أحدث الأدلة للمتابعة.','Show fresh evidence to continue.','Devam etmek için güncel kaynakları görüntüleyin.','Affichez des sources à jour pour continuer.','Для продолжения загрузите актуальные данные.']
  };
  function t(key,lang){return words[key]?.[Math.max(0,locales.indexOf(lang))]||'';}
  function scopeKey(s){
    return s?.authenticated&&s.workspaceId&&s.userId&&s.sessionVersion?
      JSON.stringify([s.workspaceId,s.userId,s.sessionVersion,s.authGeneration??0,s.role,s.mode]):'';
  }
  const permissions={products:'products.view',customers:'customers.view',invoices:'invoices.view',finance:'finance.view',chat:'chat.view'};
  const routes={products:'products',customers:'companies',invoices:'invoices',finance:'finance',chat:'chat'};
  function errorKey(code){
    if(['AUTH_REQUIRED','ACCESS_DENIED','SESSION_EXPIRED','SESSION_REVOKED','ACCOUNT_UNAVAILABLE'].includes(code))return 'denied';
    if(code==='AI_NOT_CONFIGURED')return 'aiOff';
    if(['INVALID_REQUEST','INVALID_ASSISTANT_INPUT'].includes(code))return 'invalid';
    if(['AI_EVIDENCE_CHANGED','IDEMPOTENCY_MISMATCH'].includes(code))return 'changed';
    if(code==='AI_DAILY_LIMIT')return 'limit';
    if(code==='AI_BUSY'||code==='AI_IN_PROGRESS')return 'busy';
    if(code==='AI_CIRCUIT_OPEN')return 'circuit';
    if(code==='AI_RECEIPT_EXPIRED'||code==='AI_RESULT_UNAVAILABLE')return 'expired';
    if(['AI_PROVIDER_OUTPUT','AI_PROVIDER_TIMEOUT','AI_PROVIDER_UNAVAILABLE','AI_PROVIDER_REFUSAL'].includes(code))return 'upstream';
    return 'failed';
  }
  function amount(value,currency,lang){
    const part=/^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
    if(!part)return '—';
    const integer=new Intl.NumberFormat(lang,{maximumFractionDigits:0}).format(BigInt(part[2]));
    const fraction=(part[3]||'').replace(/0+$/,'').padEnd(2,'0');
    const digits=new Intl.NumberFormat(lang,{useGrouping:false}),radix=digits.formatToParts(1.1).find(v=>v.type==='decimal').value;
    return (part[1]?'−':'')+integer+radix+[...fraction].map(d=>digits.format(Number(d))).join('')+' '+currency;
  }
  function modes(sources){return [...(sources.products||sources.invoices||sources.customers?['search','checks']:[]),...(sources.finance?['report']:[]),...(sources.chat?['chat']:[])];}
  return Object.freeze({locales,t,scopeKey,permissions,routes,errorKey,amount,modes});
});
