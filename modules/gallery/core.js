(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.WFGalleryCore=api;
})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const locales=['ar','en','tr','fr','ru'];
  const words={
    orderList:['طلباتي','My orders','Siparişlerim','Mes commandes','Мои заказы'],
    reviewSaved:['تم حفظ المحاولة السابقة. راجع السجل قبل إرسال تغيير آخر.','The previous attempt was saved. Review the record before submitting another change.','Önceki işlem kaydedildi. Başka bir değişiklik göndermeden önce kaydı kontrol edin.','La tentative précédente a été enregistrée. Vérifiez le dossier avant une autre modification.','Предыдущая операция сохранена. Проверьте запись перед новой отправкой.'],
    cartLimit:['الحد الأقصى للطلب ١٠٠ منتج مختلف.','An order can contain up to 100 different products.','Sipariş en fazla 100 farklı ürün içerebilir.','Une commande accepte jusqu’à 100 produits distincts.','В заказе может быть до 100 разных товаров.'],
    customerNote:['رسالة للعميل','Update for customer','Müşteriye güncelleme','Message au client','Сообщение клиенту'],
    lowStock:['كمية محدودة','Low stock','Az stok','Stock limité','Мало в наличии'],
    pendingOffline:['الطلب قيد المزامنة. يظهر التأكيد بعد موافقة الخادم.','Awaiting sync. Confirmation appears after the server accepts the change.','Eşitleme bekleniyor. Sunucu onayından sonra sonuç gösterilir.','Synchronisation en attente. La confirmation suivra l’accord du serveur.','Ожидается синхронизация. Подтверждение появится после ответа сервера.'],
    networkUnknown:['انقطع الاتصال. بقيت المسودة بانتظار التحقق من الخادم.','Connection lost. Your draft is retained until the server confirms the change.','Bağlantı kesildi. Sunucu işlemi doğrulayana kadar taslağınız korunur.','Connexion interrompue. Le brouillon est conservé en attendant la confirmation du serveur.','Соединение прервано. Черновик сохранён до подтверждения сервера.'],
    savedCopy:['تُعرض نسخة الجهاز المحفوظة.','Showing the saved device copy.','Cihaza kaydedilen kopya gösteriliyor.','Affichage de la copie enregistrée sur cet appareil.','Показана сохранённая копия на устройстве.'],
    camera:['الكاميرا','Camera','Kamera','Appareil photo','Камера'],
    gallery:['معرض المنتجات','Product gallery','Ürün galerisi','Galerie de produits','Галерея товаров'],
    orders:['إدارة الطلبات','Manage orders','Sipariş yönetimi','Gestion des commandes','Управление заказами'],
    mine:['طلباتي ومخزوني','My orders and stock','Siparişlerim ve stoklarım','Mes commandes et mon stock','Мои заказы и остатки'],
    studio:['إدارة المعرض','Gallery settings','Galeri ayarları','Réglages de la galerie','Настройки галереи'],
    stock:['المخزون','Stock','Stok','Stock','Остаток'],quantity:['الكمية','Quantity','Adet','Quantité','Количество'],
    available:['متاح','Available','Mevcut','Disponible','В наличии'],out:['نفد المخزون','Out of stock','Tükendi','Épuisé','Нет в наличии'],
    category:['المجموعة','Collection','Koleksiyon','Collection','Коллекция'],all:['الكل','All','Tümü','Tout','Все'],
    search:['بحث','Search','Ara','Rechercher','Поиск'],grid:['شبكة','Grid','Izgara','Grille','Плитки'],list:['قائمة','List','Liste','Liste','Список'],
    loading:['جارٍ التحميل…','Loading…','Yükleniyor…','Chargement…','Загрузка…'],
    empty:['لا توجد نتائج مطابقة.','No matching records.','Eşleşen kayıt yok.','Aucun résultat.','Нет подходящих записей.'],
    noProducts:['لا توجد منتجات منشورة في المعرض.','No products have been published to this gallery.','Galeride yayımlanmış ürün yok.','Aucun produit publié dans la galerie.','В галерее пока нет опубликованных товаров.'],
    signedOut:['سجّل الدخول إلى مساحة العمل السحابية لفتح هذا القسم.','Sign in to the cloud workspace to open this section.','Bu bölümü açmak için bulut çalışma alanında oturum açın.','Connectez-vous à votre espace cloud pour ouvrir cette section.','Войдите в облачное рабочее пространство, чтобы открыть раздел.'],
    retry:['إعادة المحاولة','Retry','Yeniden dene','Réessayer','Повторить'],refresh:['تحديث','Refresh','Yenile','Actualiser','Обновить'],
    changed:['تغيّر السجل. حدّث الصفحة وراجع القيم قبل الحفظ.','The record changed. Refresh and review the current values before saving.','Kayıt değişti. Yenileyip değerleri kontrol edin.','Le dossier a changé. Actualisez et vérifiez les valeurs.','Запись изменилась. Обновите и проверьте значения.'],
    denied:['لا يملك هذا الحساب صلاحية تنفيذ الإجراء.','This account lacks permission for this action.','Bu hesap işlem için yetkili değil.','Ce compte ne dispose pas de cette autorisation.','У аккаунта нет разрешения на это действие.'],
    failed:['تعذّر إكمال العملية.','The operation could not be completed.','İşlem tamamlanamadı.','Impossible de terminer l’opération.','Не удалось выполнить операцию.'],
    invalid:['راجع القيم المدخلة.','Check the entered values.','Girilen değerleri kontrol edin.','Vérifiez les valeurs saisies.','Проверьте введённые значения.'],
    stockChanged:['تغيّرت الكمية المتاحة. راجع السلة.','Availability changed. Review the cart.','Stok değişti. Sepetinizi kontrol edin.','Le stock a changé. Vérifiez le panier.','Наличие изменилось. Проверьте корзину.'],
    soldLimit:['الكمية أو حالة الطلب لا تسمح بهذه الحركة.','The quantity or order status prevents this transaction.','Miktar veya sipariş durumu bu işleme izin vermiyor.','La quantité ou l’état de la commande empêche cette opération.','Количество или статус не допускают эту операцию.'],
    model:['المنتج','Product','Ürün','Produit','Товар'],price:['السعر','Price','Fiyat','Prix','Цена'],currency:['العملة','Currency','Para birimi','Devise','Валюта'],
    dims:['الأبعاد والوزن','Dimensions and weight','Ölçüler ve ağırlık','Dimensions et poids','Размеры и вес'],weight:['الوزن','Weight','Ağırlık','Poids','Вес'],
    image:['صورة','Photo','Görsel','Photo','Фото'],download:['تنزيل','Download','İndir','Télécharger','Скачать'],
    select:['تحديد','Select','Seç','Sélectionner','Выбрать'],selectAll:['تحديد الكل','Select all','Tümünü seç','Tout sélectionner','Выбрать все'],
    clear:['مسح','Clear','Temizle','Effacer','Очистить'],cart:['سلة الطلب','Order cart','Sipariş sepeti','Panier','Корзина'],
    add:['إضافة','Add','Ekle','Ajouter','Добавить'],remove:['إزالة','Remove','Kaldır','Retirer','Убрать'],
    confirm:['تأكيد','Confirm','Onayla','Confirmer','Подтвердить'],accepted:['راجعت المنتجات والكميات والأسعار.','I have reviewed the products, quantities and prices.','Ürünleri, miktarları ve fiyatları kontrol ettim.','J’ai vérifié les produits, les quantités et les prix.','Я проверил(а) товары, количество и цены.'],
    place:['تأكيد الطلب','Place order','Siparişi gönder','Passer commande','Оформить заказ'],note:['ملاحظة','Note','Not','Note','Примечание'],
    total:['الإجمالي','Total','Toplam','Total','Итого'],order:['طلب','Order','Sipariş','Commande','Заказ'],status:['الحالة','Status','Durum','Statut','Статус'],
    date:['التاريخ','Date','Tarih','Date','Дата'],customer:['العميل','Customer','Müşteri','Client','Клиент'],
    pending:['قيد الانتظار','Pending','Beklemede','En attente','Ожидает'],manufacturing:['قيد التصنيع','In production','Üretimde','En fabrication','В производстве'],
    ready:['جاهز للتسليم','Ready','Teslime hazır','Prêt','Готов'],delivered:['تم التسليم','Delivered','Teslim edildi','Livré','Доставлен'],
    cancelled:['ملغى','Cancelled','İptal edildi','Annulé','Отменён'],edit:['تعديل','Edit','Düzenle','Modifier','Изменить'],
    archive:['إلغاء وأرشفة','Cancel and archive','İptal et ve arşivle','Annuler et archiver','Отменить и архивировать'],confirmArchive:['إلغاء الطلب وإرجاع الكمية المحجوزة؟','Cancel this order and restore its reserved stock?','Sipariş iptal edilip ayrılan stok iade edilsin mi?','Annuler la commande et restituer le stock réservé ?','Отменить заказ и вернуть зарезервированные остатки?'],
    adminNote:['ملاحظة داخلية','Internal note','Dahili not','Note interne','Служебная заметка'],save:['حفظ','Save','Kaydet','Enregistrer','Сохранить'],
    close:['إغلاق','Close','Kapat','Fermer','Закрыть'],print:['طباعة','Print','Yazdır','Imprimer','Печать'],share:['مشاركة','Share','Paylaş','Partager','Поделиться'],
    pdf:['PDF','PDF','PDF','PDF','PDF'],excel:['Excel','Excel','Excel','Excel','Excel'],preview:['معاينة','Preview','Önizleme','Aperçu','Просмотр'],
    publish:['منشور','Published','Yayında','Publié','Опубликован'],badge:['التسمية','Badge text','Etiket','Libellé','Метка'],
    primaryPrice:['استخدام سعر المنتج الأساسي بالدولار','Use primary product price in USD','Ana ürün fiyatını USD olarak kullan','Utiliser le prix produit en USD','Использовать базовую цену в USD'],
    products:['المنتجات','Products','Ürünler','Produits','Товары'],stockAdmin:['إدارة مخزون المعرض','Gallery inventory','Galeri stoğu','Stock de la galerie','Склад галереи'],
    saveStock:['حفظ التغييرات في المخزون','Save inventory changes','Stok değişikliklerini kaydet','Enregistrer les changements de stock','Сохранить изменения остатков'],
    personalStock:['مخزوني','My inventory','Stoklarım','Mon stock','Мой склад'],purchased:['المشترى','Purchased','Alınan','Acheté','Куплено'],
    sold:['المباع','Sold','Satılan','Vendu','Продано'],remaining:['المتبقي','Remaining','Kalan','Restant','Осталось'],sale:['تسجيل بيع','Record sale','Satış kaydet','Enregistrer une vente','Записать продажу'],
    sales:['سجل المبيعات','Sales history','Satış geçmişi','Historique des ventes','История продаж'],reverse:['عكس البيع','Reverse sale','Satışı geri al','Annuler la vente','Отменить продажу'],
    reversed:['تم العكس','Reversed','Geri alındı','Annulée','Отменено'],confirmReverse:['هل تريد عكس هذه المبيعة؟','Reverse this sale?','Bu satış geri alınsın mı?','Annuler cette vente ?','Отменить эту продажу?'],
    buyer:['المشتري','Buyer','Alıcı','Acheteur','Покупатель'],phone:['الهاتف','Phone','Telefon','Téléphone','Телефон'],base:['سعر الشراء','Purchase price','Alış fiyatı','Prix d’achat','Закупочная цена'],
    retail:['سعر البيع','Resale price','Satış fiyatı','Prix de revente','Цена перепродажи'],profit:['الربح للوحدة','Profit per unit','Birim kâr','Marge unitaire','Прибыль за единицу'],
    showBase:['عرض سعر الشراء','Show purchase price','Alış fiyatını göster','Afficher le prix d’achat','Показывать закупочную цену'],
    showRetail:['عرض سعر البيع','Show resale price','Satış fiyatını göster','Afficher le prix de revente','Показывать цену продажи'],
    showPrint:['تضمين في الطباعة','Include in print','Baskıya ekle','Inclure dans l’impression','Включать в печать'],
    hide:['إخفاء المنتج','Hide item','Ürünü gizle','Masquer le produit','Скрыть товар'],showHidden:['عرض العناصر المخفية','Show hidden items','Gizli ürünleri göster','Afficher les produits masqués','Показать скрытые товары'],
    printSettings:['إعدادات الطباعة','Print settings','Baskı ayarları','Réglages d’impression','Настройки печати'],company:['الشركة','Company','Şirket','Entreprise','Компания'],
    logo:['الشعار','Logo','Logo','Logo','Логотип'],footer:['تذييل','Footer','Alt bilgi','Pied de page','Нижний колонтитул'],cards:['بطاقات المجموعات','Collection cards','Koleksiyon kartları','Cartes de collection','Карточки коллекций'],
    slides:['شرائح العرض','Slideshow','Slaytlar','Diaporama','Слайд-шоу'],fields:['حقول المواصفات','Specification fields','Özellik alanları','Champs de caractéristiques','Поля характеристик'],
    brand:['هوية المعرض','Gallery identity','Galeri kimliği','Identité de la galerie','Оформление галереи'],title:['العنوان','Title','Başlık','Titre','Название'],
    subtitle:['العنوان الفرعي','Subtitle','Alt başlık','Sous-titre','Подзаголовок'],description:['الوصف','Description','Açıklama','Description','Описание'],
    countLabel:['نص العداد','Count label','Sayaç etiketi','Libellé du compteur','Подпись счётчика'],buttonText:['نص الزر','Button text','Düğme metni','Texte du bouton','Текст кнопки'],
    priceLabel:['السعر المعروض','Display price','Görünen fiyat','Prix affiché','Отображаемая цена'],visible:['مرئي','Visible','Görünür','Visible','Виден'],
    moveUp:['تحريك لأعلى','Move up','Yukarı taşı','Monter','Вверх'],moveDown:['تحريك لأسفل','Move down','Aşağı taşı','Descendre','Вниз'],
    unit:['الوحدة','Unit','Birim','Unité','Единица'],icon:['الأيقونة','Icon','Simge','Icône','Значок'],
    previous:['السابق','Previous','Önceki','Précédent','Назад'],next:['التالي','Next','Sonraki','Suivant','Далее'],
    autoplay:['تشغيل تلقائي','Auto-play','Otomatik oynat','Lecture automatique','Автопоказ'],interval:['الثواني لكل شريحة','Seconds per slide','Slayt süresi (sn)','Secondes par diapositive','Секунд на слайд'],
    tagline:['سطر التعريف','Tagline','Slogan','Sous-titre de marque','Подпись марки'],socialTitle:['عنوان المعاينة الاجتماعية','Social preview title','Sosyal önizleme başlığı','Titre de l’aperçu social','Заголовок предпросмотра'],
    socialDesc:['وصف المعاينة الاجتماعية','Social preview description','Sosyal önizleme açıklaması','Description de l’aperçu social','Описание предпросмотра'],
    socialImage:['صورة المعاينة الاجتماعية','Social preview image','Sosyal önizleme görseli','Image de l’aperçu social','Изображение предпросмотра'],
    upload:['رفع صورة','Upload photo','Fotoğraf yükle','Importer une photo','Загрузить фото'],onlyStock:['المتاح فقط','In stock only','Yalnızca stoktakiler','En stock uniquement','Только в наличии'],
    filters:['تصفية','Filters','Filtreler','Filtres','Фильтры'],clearCart:['تفريغ السلة؟','Clear the cart?','Sepet temizlensin mi?','Vider le panier ?','Очистить корзину?'],
    consent:['مراجعة وإرسال','Review and submit','Kontrol et ve gönder','Vérifier et envoyer','Проверить и отправить'],printOne:['طباعة المنتج','Print item','Ürünü yazdır','Imprimer le produit','Печать товара'],
    saved:['تم الحفظ.','Saved.','Kaydedildi.','Enregistré.','Сохранено.'],
    noPrice:['لم يُحدد سعر','Price unavailable','Fiyat belirlenmedi','Prix indisponible','Цена не указана'],missingImage:['الصورة غير متاحة.','The image is unavailable.','Görsel kullanılamıyor.','Image indisponible.','Изображение недоступно.']
  };
  const t=(key,language='ar')=>(words[key]||[key,key,key,key,key])[Math.max(0,locales.indexOf(language))];
  const typed=id=>JSON.stringify(id);
  function minor(value){
    const match=/^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(String(value).trim());
    return match?Number(match[1])*100+Number((match[2]||'').padEnd(2,'0')):null;
  }
  function money(units,currency='USD',language='ar'){
    if(units==null)return '—';
    const value=BigInt(units),absolute=value<0n?-value:value;
    const decimals=new Intl.NumberFormat(language,{minimumIntegerDigits:2,useGrouping:false}).format(Number(absolute%100n));
    const major=absolute/100n;
    const format=new Intl.NumberFormat(language,{style:'currency',currency,minimumFractionDigits:2,maximumFractionDigits:2});
    const parts=format.formatToParts(value<0n?(major===0n?-0:-major):major);
    return parts.map(part=>part.type==='fraction'?decimals:part.value).join('');
  }
  function totals(items){
    const result=new Map();
    for(const item of items){if(item.priceMinor!=null)result.set(item.currency,(result.get(item.currency)||0n)+BigInt(item.priceMinor)*BigInt(item.quantity));}
    return result;
  }
  function normalizeCart(raw){
    const cart=new Map();
    if(!Array.isArray(raw))return cart;
    for(const line of raw.slice(0,100)){
      if(line && (typeof line.productId==='string'&&line.productId.length<=180||Number.isSafeInteger(line.productId))&&
        Number.isSafeInteger(line.quantity)&&line.quantity>0&&line.quantity<=1000000)cart.set(typed(line.productId),{productId:line.productId,quantity:line.quantity});
    }
    return cart;
  }
  function scopeKey(snapshot){
    if(!(snapshot?.authenticated||snapshot?.offlineVerified)||!snapshot.workspaceId||!snapshot.userId||!snapshot.currentAccount)return null;
    return JSON.stringify([snapshot.workspaceId,snapshot.userId,snapshot.sessionVersion,snapshot.authGeneration]);
  }
  function cartKey(snapshot){return 'wf.gallery.cart.v1:'+JSON.stringify([snapshot.workspaceId,snapshot.userId]);}
  function stockRows(products,selection){
    const byId=new Map(products.map(p=>[typed(p.productId),p]));
    return [...selection.values()].map(line=>{const product=byId.get(typed(line.productId));
      return {...line,product,priceMinor:product?.priceMinor??null,currency:product?.currency||'USD',available:!!product?.published&&product.stock>=line.quantity&&product.priceMinor!=null};
    });
  }
  function presentation(value={}){
    return {cards:[],slides:[],fields:[],autoplay:true,interval:6,tagline:'',footer:'',ogTitle:'',ogDescription:'',logoId:null,ogImageId:null,version:0,...value};
  }
  function userError(error,lang){
    const map={NETWORK:'networkUnknown',GALLERY_PENDING:'pendingOffline',PREVIOUS_CHANGE_SAVED:'reviewSaved',INVALID_CART_LIMIT:'cartLimit',CONFLICT:'changed',INVALID_STOCK_QUANTITY:'stockChanged',INVALID_PRODUCT_UNAVAILABLE:'stockChanged',INVALID_SOLD_QUANTITY:'soldLimit',
      AUTH_REQUIRED:'signedOut',SESSION_REVOKED:'signedOut',SESSION_EXPIRED:'signedOut',ACCESS_DENIED:'denied',PERMISSION_DENIED:'denied'};
    const code=error?.code||error?.message;
    return t(map[code]||(String(code).startsWith('INVALID_')?'invalid':'failed'),lang);
  }
  return Object.freeze({locales,t,typed,minor,money,totals,normalizeCart,cartKey,scopeKey,stockRows,presentation,userError});
});
