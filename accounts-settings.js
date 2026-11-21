/* Scoped employee accounts use the existing settings editor and action dock. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else factory(root);
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const document = root.document;
  const page = document?.getElementById('page-settings');
  const workspace = page?.querySelector('.wf-settings-workspace');
  if (!workspace || root.WFAccounts) return root.WFAccounts || null;
  const locales = ['ar', 'en', 'tr', 'fr', 'ru'];
  const copy = {
    title:['الحسابات والصلاحيات','Accounts and permissions','Hesaplar ve izinler','Comptes et autorisations','Учётные записи и права'],
    local:['هذه حسابات هذا الجهاز. حسابات العمال المتصلين تُدار من قسم السحابة.','These accounts belong to this device. Manage remote employees in the Cloud section.','Bunlar bu cihazın hesaplarıdır. Uzaktan çalışan hesaplarını Bulut bölümünden yönetin.','Ces comptes appartiennent à cet appareil. Gérez les employés à distance dans la rubrique Cloud.','Эти учётные записи относятся к этому устройству. Удалёнными сотрудниками управляйте в разделе «Облако».'],
    loading:['جارٍ تحميل الحسابات…','Loading accounts…','Hesaplar yükleniyor…','Chargement des comptes…','Загрузка учётных записей…'],
    unavailable:['تعذّر تحميل الحسابات. أعد المحاولة.','Could not load accounts. Please try again.','Hesaplar yüklenemedi. Tekrar deneyin.','Impossible de charger les comptes. Réessayez.','Не удалось загрузить учётные записи. Повторите попытку.'],
    retry:['إعادة المحاولة','Retry','Yeniden dene','Réessayer','Повторить'],
    firstTitle:['أنشئ حساب المالك أولًا','Create the owner account first','Önce sahip hesabını oluşturun','Créez d’abord le compte propriétaire','Сначала создайте учётную запись владельца'],
    firstHint:['يحافظ حساب المالك على إدارة الموظفين والصلاحيات. احتفظ باسم الدخول وكلمة المرور.','The owner manages employees and permissions. Keep the login name and password.','Sahip, çalışanları ve izinleri yönetir. Giriş adınızı ve parolanızı saklayın.','Le propriétaire gère les employés et les autorisations. Conservez le nom de connexion et le mot de passe.','Владелец управляет сотрудниками и правами. Сохраните имя для входа и пароль.'],
    createOwner:['إنشاء حساب المالك','Create owner account','Sahip hesabını oluştur','Créer le compte propriétaire','Создать владельца'],
    add:['إضافة حساب','Add account','Hesap ekle','Ajouter un compte','Добавить учётную запись'],
    edit:['تعديل الحساب','Edit account','Hesabı düzenle','Modifier le compte','Изменить учётную запись'],
    details:['التفاصيل','Details','Ayrıntılar','Détails','Подробнее'],
    back:['العودة إلى الحسابات','Back to accounts','Hesaplara dön','Retour aux comptes','К учётным записям'],
    backDetails:['العودة إلى التفاصيل','Back to details','Ayrıntılara dön','Retour aux détails','К сведениям'],
    save:['حفظ الحساب','Save account','Hesabı kaydet','Enregistrer le compte','Сохранить учётную запись'],
    saving:['جارٍ الحفظ…','Saving…','Kaydediliyor…','Enregistrement…','Сохранение…'],
    cancel:['إلغاء','Cancel','İptal','Annuler','Отмена'],
    saved:['تم حفظ الحساب.','Account saved.','Hesap kaydedildi.','Compte enregistré.','Учётная запись сохранена.'],
    updated:['تم تحديث الحساب.','Account updated.','Hesap güncellendi.','Compte mis à jour.','Учётная запись обновлена.'],
    search:['البحث بالاسم أو اسم الدخول','Search name or login','Ad veya giriş adı ara','Rechercher un nom ou identifiant','Поиск по имени или логину'],
    status:['الحالة','Status','Durum','État','Статус'],
    all:['كل الحالات','All statuses','Tüm durumlar','Tous les états','Все статусы'],
    currentAccounts:['الحسابات غير المحذوفة','Accounts not deleted','Silinmemiş hesaplar','Comptes non supprimés','Неудалённые записи'],
    active:['نشط','Active','Etkin','Actif','Активна'],
    suspended:['موقوف مؤقتًا','Suspended','Askıya alındı','Suspendu','Приостановлена'],
    revoked:['الوصول مسحوب','Access revoked','Erişim kaldırıldı','Accès révoqué','Доступ отозван'],
    deleted:['محذوف','Deleted','Silindi','Supprimé','Удалена'],
    expired:['انتهت مدة الوصول','Access expired','Erişim süresi doldu','Accès expiré','Доступ истёк'],
    none:['لا توجد حسابات مطابقة.','No matching accounts.','Eşleşen hesap yok.','Aucun compte correspondant.','Подходящих учётных записей нет.'],
    showAll:['عرض كل الحسابات','Show all accounts','Tüm hesapları göster','Afficher tous les comptes','Показать все записи'],
    name:['اسم صاحب الحساب','Account holder name','Hesap sahibinin adı','Nom du titulaire du compte','Имя владельца учётной записи'],
    username:['اسم الدخول','Login name','Giriş adı','Nom de connexion','Имя для входа'],
    usernameHint:['من 3 إلى 64 حرفًا؛ حروف وأرقام و . _ - @ دون مسافات.','3–64 characters; letters, numbers and . _ - @, without spaces.','3–64 karakter; harf, rakam ve . _ - @; boşluk kullanmayın.','3 à 64 caractères : lettres, chiffres et . _ - @, sans espaces.','3–64 символа: буквы, цифры и . _ - @, без пробелов.'],
    password:['كلمة المرور','Password','Parola','Mot de passe','Пароль'],
    newPassword:['كلمة المرور الجديدة','New password','Yeni parola','Nouveau mot de passe','Новый пароль'],
    currentPassword:['كلمة المرور الحالية','Current password','Mevcut parola','Mot de passe actuel','Текущий пароль'],
    confirmPassword:['تأكيد كلمة المرور','Confirm password','Parolayı doğrula','Confirmer le mot de passe','Повторите пароль'],
    passwordHint:['من 12 إلى 128 حرفًا. لا يمكن عرض كلمة المرور المحفوظة.','12–128 characters. A saved password cannot be displayed.','12–128 karakter. Kayıtlı parola görüntülenemez.','12 à 128 caractères. Le mot de passe enregistré ne peut pas être affiché.','12–128 символов. Сохранённый пароль нельзя просмотреть.'],
    showPassword:['إظهار','Show','Göster','Afficher','Показать'],
    hidePassword:['إخفاء','Hide','Gizle','Masquer','Скрыть'],
    passwordMismatch:['كلمتا المرور غير متطابقتين.','The passwords do not match.','Parolalar eşleşmiyor.','Les mots de passe ne correspondent pas.','Пароли не совпадают.'],
    passwordLength:['استخدم كلمة مرور من 12 إلى 128 حرفًا.','Use a password with 12–128 characters.','12–128 karakterli bir parola kullanın.','Utilisez un mot de passe de 12 à 128 caractères.','Используйте пароль длиной 12–128 символов.'],
    resetPassword:['تغيير كلمة المرور','Change password','Parolayı değiştir','Changer le mot de passe','Изменить пароль'],
    resetHint:['سيُطلب تسجيل الدخول مجددًا من الجلسات المحلية الأخرى لهذا الحساب.','Other local sessions for this account will need to sign in again.','Bu hesabın diğer yerel oturumlarında yeniden giriş gerekir.','Les autres sessions locales de ce compte devront se reconnecter.','В других локальных сеансах этой учётной записи потребуется новый вход.'],
    passwordSaved:['تم تغيير كلمة المرور.','Password changed.','Parola değiştirildi.','Mot de passe modifié.','Пароль изменён.'],
    role:['قالب الصلاحيات','Permission preset','İzin şablonu','Modèle d’autorisations','Шаблон прав'],
    presetHint:['اختر قالبًا ثم عدّل صلاحيات الحساب. تغيير القالب يستبدل اختيارات الصلاحيات.','Choose a preset, then adjust the permissions for this account. Changing the preset replaces the selected permissions.','Bir şablon seçip hesabın izinlerini düzenleyin. Şablonu değiştirmek izin seçimlerini yeniler.','Choisissez un modèle puis adaptez les autorisations du compte. Changer de modèle remplace les autorisations sélectionnées.','Выберите шаблон и настройте права учётной записи. Смена шаблона заменяет выбранные права.'],
    customized:['صلاحيات مخصّصة','Customized permissions','Özelleştirilmiş izinler','Autorisations personnalisées','Права настроены вручную'],
    department:['القسم / المهنة','Department / job','Bölüm / görev','Service / métier','Отдел / должность'],
    note:['ملاحظة إدارية','Administrative note','Yönetim notu','Note administrative','Административное примечание'],
    optional:['اختياري','Optional','İsteğe bağlı','Facultatif','Необязательно'],
    expiry:['نهاية مدة الوصول','Access end date','Erişim bitiş tarihi','Date de fin d’accès','Дата окончания доступа'],
    expiryHint:['اختياري. ينتهي الوصول بنهاية اليوم المحدد على هذا الجهاز.','Optional. Access ends at the end of the selected day on this device.','İsteğe bağlı. Erişim, bu cihazda seçilen günün sonunda biter.','Facultatif. L’accès se termine à la fin du jour choisi sur cet appareil.','Необязательно. Доступ завершится в конце выбранного дня по времени устройства.'],
    noExpiry:['بلا تاريخ انتهاء','No end date','Bitiş tarihi yok','Sans date de fin','Без срока окончания'],
    permissions:['الصلاحيات','Permissions','İzinler','Autorisations','Права'],
    permissionsHint:['فعّل العرض أولًا. إلغاء العرض يلغي باقي صلاحيات القسم.','Enable View first. Turning it off removes the other permissions for that section.','Önce Görüntüle’yi açın. Kapatmak bölümün diğer izinlerini kaldırır.','Activez d’abord Voir. Le désactiver retire les autres autorisations de la rubrique.','Сначала включите просмотр. Его отключение убирает остальные права раздела.'],
    ownerPermissions:['المالك يملك جميع صلاحيات الإدارة؛ لا يمكن تخصيصها.','The owner has all administration permissions; they cannot be customized.','Sahibin tüm yönetim izinleri vardır; özelleştirilemez.','Le propriétaire dispose de toutes les autorisations administratives ; elles ne sont pas personnalisables.','Владелец имеет все административные права; они не изменяются.'],
    ownerOnly:['للمالك فقط','Owner only','Yalnızca sahip','Propriétaire uniquement','Только владелец'],
    view:['عرض','View','Görüntüle','Voir','Просмотр'],
    editAction:['تعديل','Edit','Düzenle','Modifier','Изменение'],
    deleteAction:['حذف','Delete','Sil','Supprimer','Удаление'],
    print:['طباعة','Print','Yazdır','Imprimer','Печать'],
    export:['تصدير','Export','Dışa aktar','Exporter','Экспорт'],
    notAvailable:['غير متاح لهذا القسم','Not available for this section','Bu bölümde kullanılamaz','Indisponible pour cette rubrique','Недоступно в этом разделе'],
    preview:['الإجراءات المتاحة للحساب','Actions available to this account','Bu hesaba açık işlemler','Actions autorisées pour ce compte','Действия, доступные этой учётной записи'],
    noPermissions:['لا توجد صلاحيات مفعّلة.','No permissions enabled.','Etkin izin yok.','Aucune autorisation activée.','Права не предоставлены.'],
    hiddenSections:['الأقسام غير المسموحة','Sections without access','Erişilemeyen bölümler','Rubriques sans accès','Разделы без доступа'],
    noHidden:['يمكنه عرض جميع الأقسام.','Can view every section.','Tüm bölümleri görüntüleyebilir.','Peut voir toutes les rubriques.','Доступны все разделы.'],
    overview:['بيانات الحساب','Account information','Hesap bilgileri','Informations du compte','Сведения об учётной записи'],
    created:['تاريخ الإنشاء','Created','Oluşturulma','Créé le','Создана'],
    lastUpdated:['آخر تعديل','Last updated','Son güncelleme','Dernière modification','Последнее изменение'],
    lastLogin:['آخر دخول مسجّل','Last recorded sign-in','Son kayıtlı giriş','Dernière connexion enregistrée','Последний зарегистрированный вход'],
    lockedUntil:['الدخول موقوف حتى','Sign-in paused until','Girişin açılacağı zaman','Connexion suspendue jusqu’au','Вход приостановлен до'],
    never:['لا يوجد دخول مسجّل','No recorded sign-in','Kayıtlı giriş yok','Aucune connexion enregistrée','Нет зарегистрированных входов'],
    session:['الجلسة المحلية','Local session','Yerel oturum','Session locale','Локальный сеанс'],
    currentSession:['الحساب المستخدم في هذه النافذة','Account in use in this window','Bu pencerede kullanılan hesap','Compte utilisé dans cette fenêtre','Учётная запись в этом окне'],
    otherSession:['ليس الحساب المستخدم في هذه النافذة','Not the account in use in this window','Bu pencerede kullanılan hesap değil','Ce compte n’est pas utilisé dans cette fenêtre','Эта учётная запись не используется в этом окне'],
    sessionHint:['تظهر هنا الجلسة الحالية فقط؛ لا توجد متابعة لأجهزة بعيدة.','Only the current session is shown here; remote devices are not monitored.','Burada yalnızca mevcut oturum görünür; uzak cihazlar izlenmez.','Seule la session actuelle est indiquée ; les appareils distants ne sont pas suivis.','Здесь показан только текущий сеанс; удалённые устройства не отслеживаются.'],
    ownerSessionHint:['حساب المالك (الأدمن) يحتفظ بكامل صلاحياته، ويبقى مفتوحًا أثناء الخمول وتحديث الصفحة في هذه النافذة. يمكنك تبديل الحساب يدويًا.','The owner keeps full permissions and stays signed in during inactivity and reloads in this tab. You can switch accounts manually.','Sahip tüm yetkilerini korur; bu sekmede işlem yapmadığında ve sayfa yenilendiğinde oturumu açık kalır. Hesabı kendiniz değiştirebilirsiniz.','Le propriétaire conserve tous ses droits et reste connecté dans cet onglet pendant l’inactivité et au rechargement. Vous pouvez changer de compte manuellement.','Владелец сохраняет все права и остаётся в системе при бездействии и перезагрузке этой вкладки. Учётную запись можно сменить вручную.'],
    employeeSessionHint:['حساب العامل يُقفل بعد 30 دقيقة دون استخدام وعند تحديث الصفحة، ويلتزم بالأقسام والإجراءات المسموحة له.','Employee accounts lock after 30 idle minutes and on reload, and use only their permitted sections and actions.','Çalışan hesapları 30 dakika kullanılmadığında ve sayfa yenilendiğinde kilitlenir; yalnızca izin verilen bölümleri ve işlemleri kullanabilir.','Les comptes employés se verrouillent après 30 minutes d’inactivité et au rechargement ; seuls leurs rubriques et actions autorisées sont accessibles.','Учётные записи сотрудников блокируются после 30 минут бездействия и при перезагрузке; доступны только разрешённые разделы и действия.'],
    activity:['سجل النشاط','Activity log','İşlem geçmişi','Journal d’activité','Журнал действий'],
    activityHint:['يعرض الأحداث المسجّلة منذ تفعيل الحسابات على هذا الجهاز.','Shows events recorded since accounts were enabled on this device.','Bu cihazda hesaplar etkinleştirildikten sonra kaydedilen olayları gösterir.','Affiche les événements enregistrés depuis l’activation des comptes sur cet appareil.','Показаны события, записанные после включения учётных записей на этом устройстве.'],
    noActivity:['لا يوجد نشاط مسجّل لهذا الحساب.','No recorded activity for this account.','Bu hesap için kayıtlı işlem yok.','Aucune activité enregistrée pour ce compte.','Для этой учётной записи ещё нет событий.'],
    more:['عرض المزيد','Show more','Daha fazla göster','Afficher plus','Показать ещё'],
    by:['بواسطة','By','İşlemi yapan','Par','Кто'],
    failedActivity:['لم يكتمل','Unsuccessful','Başarısız','Échec','Не выполнено'],
    unknownActor:['غير مسجّل','Unrecorded','Kayıt yok','Non enregistré','Не записано'],
    lifecycle:['إدارة الوصول','Manage access','Erişimi yönet','Gérer l’accès','Управление доступом'],
    suspend:['إيقاف مؤقت','Suspend','Askıya al','Suspendre','Приостановить'],
    reactivate:['إعادة التفعيل','Reactivate','Yeniden etkinleştir','Réactiver','Возобновить'],
    revoke:['سحب الوصول','Revoke access','Erişimi kaldır','Révoquer l’accès','Отозвать доступ'],
    remove:['حذف الحساب','Delete account','Hesabı sil','Supprimer le compte','Удалить учётную запись'],
    restore:['استرجاع الحساب','Recover account','Hesabı geri getir','Récupérer le compte','Восстановить учётную запись'],
    endSessions:['إنهاء الجلسات المحلية','End local sessions','Yerel oturumları sonlandır','Fermer les sessions locales','Завершить локальные сеансы'],
    suspendHint:['سيُمنع الدخول حتى تعيد تفعيل الحساب. تبقى بياناته وصلاحياته محفوظة.','Sign-in will be blocked until you reactivate the account. Its information and permissions are kept.','Hesabı yeniden etkinleştirene kadar giriş engellenir. Bilgileri ve izinleri korunur.','La connexion sera bloquée jusqu’à la réactivation. Les informations et autorisations sont conservées.','Вход будет закрыт до возобновления доступа. Данные и права сохранятся.'],
    reactivateHint:['سيُسمح بالدخول مجددًا بالصلاحيات المحفوظة. راجع تاريخ انتهاء الوصول.','Sign-in will be allowed again with the saved permissions. Review the access end date.','Kayıtlı izinlerle yeniden giriş yapılabilir. Erişim bitiş tarihini kontrol edin.','La connexion sera à nouveau autorisée avec les droits enregistrés. Vérifiez la date de fin d’accès.','Вход снова станет доступен с сохранёнными правами. Проверьте дату окончания доступа.'],
    revokeHint:['سيُسحب الدخول وتُنهي الجلسات المحلية. تبقى بيانات الحساب وسجل نشاطه.','Login access will be revoked and local sessions ended. The account and activity history are kept.','Giriş erişimi kaldırılır ve yerel oturumlar kapanır. Hesap ve işlem geçmişi korunur.','L’accès sera révoqué et les sessions locales fermées. Le compte et l’historique sont conservés.','Доступ будет отозван, локальные сеансы завершены. Учётная запись и история сохранятся.'],
    deleteHint:['سيُوقف الدخول ويُخفى الحساب من القائمة النشطة. يبقى سجل النشاط ويمكن استرجاع الحساب لاحقًا.','Sign-in will stop and the account will leave the active list. Activity is kept, and the account can be recovered later.','Giriş durdurulur ve hesap etkin listeden kaldırılır. Geçmiş korunur, hesap daha sonra geri getirilebilir.','La connexion sera bloquée et le compte retiré de la liste active. L’historique est conservé et le compte pourra être récupéré.','Вход будет закрыт, учётная запись убрана из активного списка. История останется; запись можно восстановить позже.'],
    restoreHint:['سيُسترجع الحساب بحالة موقوف مؤقتًا. راجع بياناته ثم أعد تفعيله عند الحاجة.','The account will be recovered as Suspended. Review its information, then reactivate it when needed.','Hesap askıya alınmış durumda geri getirilir. Bilgileri kontrol edip gerektiğinde etkinleştirin.','Le compte sera récupéré à l’état suspendu. Vérifiez ses informations puis réactivez-le si nécessaire.','Учётная запись восстановится приостановленной. Проверьте данные, затем возобновите доступ.'],
    sessionsHint:['تتطلب الجلسات المحلية لهذا الحساب تسجيل الدخول مجددًا. لا يتغير حسابه أو صلاحياته.','Local sessions for this account will need to sign in again. Its account and permissions stay the same.','Bu hesabın yerel oturumlarında yeniden giriş gerekir. Hesap ve izinler değişmez.','Les sessions locales devront se reconnecter. Le compte et ses autorisations restent identiques.','В локальных сеансах потребуется повторный вход. Учётная запись и права сохранятся.'],
    reason:['سبب الإجراء','Reason','İşlem nedeni','Motif','Причина'],
    confirm:['تأكيد الإجراء','Confirm action','İşlemi onayla','Confirmer','Подтвердить'],
    selfProtected:['لا يمكن إيقاف حسابك الحالي أو حذف آخر مالك.','You cannot disable your current account or delete the last owner.','Mevcut hesabınızı devre dışı bırakamaz veya son sahibi silemezsiniz.','Vous ne pouvez pas désactiver votre compte actuel ni supprimer le dernier propriétaire.','Нельзя отключить текущую учётную запись или удалить последнего владельца.'],
    locked:['سجّل الدخول لإدارة الحسابات','Sign in to manage accounts','Hesapları yönetmek için giriş yapın','Connectez-vous pour gérer les comptes','Войдите для управления учётными записями'],
    signIn:['تسجيل الدخول','Sign in','Giriş yap','Se connecter','Войти'],
    denied:['إدارة الحسابات متاحة للمالك فقط.','Account administration is available to the owner only.','Hesap yönetimi yalnızca sahibine açıktır.','La gestion des comptes est réservée au propriétaire.','Управление учётными записями доступно только владельцу.'],
    stale:['تغيّر الحساب أثناء التعديل. ألغِ التعديلات ثم افتحه مجددًا للمراجعة.','This account changed while you were editing. Cancel the draft and reopen it to review.','Düzenleme sırasında hesap değişti. Taslağı iptal edip incelemek için yeniden açın.','Ce compte a changé pendant la modification. Annulez le brouillon puis rouvrez-le.','Учётная запись изменилась во время редактирования. Отмените черновик и откройте её снова.'],
    invalidName:['اكتب اسمًا من حرف واحد إلى 100 حرف.','Enter a name with 1–100 characters.','1–100 karakterlik bir ad girin.','Saisissez un nom de 1 à 100 caractères.','Введите имя длиной 1–100 символов.'],
    invalidUsername:['راجع اسم الدخول: من 3 إلى 64 حرفًا دون مسافات.','Check the login name: 3–64 characters, without spaces.','Giriş adını kontrol edin: boşluksuz 3–64 karakter.','Vérifiez le nom de connexion : 3 à 64 caractères, sans espaces.','Проверьте имя для входа: 3–64 символа без пробелов.'],
    duplicate:['اسم الدخول مستخدم بالفعل. اختر اسمًا آخر.','This login name is already in use. Choose another.','Bu giriş adı kullanılıyor. Başka bir ad seçin.','Ce nom de connexion est déjà utilisé. Choisissez-en un autre.','Это имя для входа уже занято. Выберите другое.'],
    invalidExpiry:['اختر تاريخ انتهاء صالحًا.','Choose a valid access end date.','Geçerli bir erişim bitiş tarihi seçin.','Choisissez une date de fin d’accès valide.','Выберите допустимую дату окончания доступа.'],
    invalidRole:['اختر قالب صلاحيات صالحًا.','Choose a valid permission preset.','Geçerli bir izin şablonu seçin.','Choisissez un modèle d’autorisations valide.','Выберите допустимый шаблон прав.'],
    customerPrincipalRoleFixed:['يبقى حساب الزبون المؤكّد بالبريد حساب زبون. أنشئ له حساب دخول منفصلًا للعمل أو الإدارة.','An email-verified customer login must remain a customer. Create a separate managed login for staff or owner access.','E-postayla doğrulanan müşteri girişi müşteri olarak kalır. Çalışan veya sahip erişimi için ayrı bir yönetilen hesap açın.','Un compte client vérifié par courriel reste un compte client. Créez un accès géré distinct pour un employé ou un propriétaire.','Подтверждённый по почте аккаунт покупателя остаётся аккаунтом покупателя. Для сотрудника или владельца создайте отдельную управляемую учётную запись.'],
    passwordIncorrect:['تعذّر التحقق من كلمة المرور الحالية.','Could not verify the current password.','Mevcut parola doğrulanamadı.','Impossible de vérifier le mot de passe actuel.','Не удалось проверить текущий пароль.'],
    missing:['لم يعد هذا الحساب متاحًا.','This account is no longer available.','Bu hesap artık kullanılamıyor.','Ce compte n’est plus disponible.','Эта учётная запись больше недоступна.'],
    failed:['تعذّر الحفظ. راجع البيانات وأعد المحاولة.','Could not save. Review the information and try again.','Kaydedilemedi. Bilgileri kontrol edip tekrar deneyin.','Enregistrement impossible. Vérifiez les informations et réessayez.','Не удалось сохранить. Проверьте данные и повторите попытку.'],
    conflict:['تغيّرت البيانات في نافذة أخرى. حدّث الحسابات وأعد المحاولة.','The information changed in another window. Refresh the accounts and try again.','Bilgiler başka bir pencerede değişti. Hesapları yenileyip tekrar deneyin.','Les informations ont changé dans une autre fenêtre. Actualisez les comptes puis réessayez.','Данные изменились в другом окне. Обновите учётные записи и повторите попытку.'],
    cryptoUnavailable:['حماية كلمات المرور غير متاحة في هذا المتصفح. افتح البرنامج عبر اتصال HTTPS ثم أعد المحاولة.','Password protection is unavailable in this browser. Open the app over HTTPS, then try again.','Bu tarayıcıda parola koruması kullanılamıyor. Uygulamayı HTTPS üzerinden açıp tekrar deneyin.','La protection des mots de passe est indisponible dans ce navigateur. Ouvrez l’application en HTTPS puis réessayez.','Защита паролей недоступна в этом браузере. Откройте приложение через HTTPS и повторите попытку.'],
    event_owner_created:['إنشاء حساب المالك','Owner account created','Sahip hesabı oluşturuldu','Compte propriétaire créé','Создана учётная запись владельца'],
    event_login_success:['تسجيل دخول','Signed in','Giriş yapıldı','Connexion','Вход выполнен'],
    event_login_failed:['محاولة دخول غير ناجحة','Unsuccessful sign-in attempt','Başarısız giriş denemesi','Tentative de connexion échouée','Неудачная попытка входа'],
    event_logout:['تسجيل خروج','Signed out','Çıkış yapıldı','Déconnexion','Выход выполнен'],
    event_account_created:['إنشاء الحساب','Account created','Hesap oluşturuldu','Compte créé','Учётная запись создана'],
    event_account_updated:['تعديل بيانات أو صلاحيات','Information or permissions updated','Bilgiler veya izinler güncellendi','Informations ou droits modifiés','Данные или права изменены'],
    event_account_suspended:['إيقاف الحساب مؤقتًا','Account suspended','Hesap askıya alındı','Compte suspendu','Учётная запись приостановлена'],
    event_account_reactivated:['إعادة تفعيل الحساب','Account reactivated','Hesap yeniden etkinleştirildi','Compte réactivé','Доступ возобновлён'],
    event_account_revoked:['سحب الوصول','Access revoked','Erişim kaldırıldı','Accès révoqué','Доступ отозван'],
    event_account_deleted:['حذف الحساب','Account deleted','Hesap silindi','Compte supprimé','Учётная запись удалена'],
    event_account_restored:['استرجاع الحساب بحالة موقوف','Account recovered as suspended','Hesap askıda olarak geri getirildi','Compte récupéré à l’état suspendu','Учётная запись восстановлена приостановленной'],
    event_password_reset:['إعادة تعيين كلمة المرور','Password reset','Parola sıfırlandı','Mot de passe réinitialisé','Пароль сброшен'],
    event_password_changed:['تغيير كلمة المرور','Password changed','Parola değiştirildi','Mot de passe modifié','Пароль изменён'],
    event_sessions_revoked:['إنهاء الجلسات المحلية','Local sessions ended','Yerel oturumlar sonlandırıldı','Sessions locales fermées','Локальные сеансы завершены'],
    event_session_expired:['انتهاء الجلسة المحلية','Local session expired','Yerel oturum süresi doldu','Session locale expirée','Локальный сеанс истёк'],
    event_unknown:['نشاط الحساب','Account activity','Hesap işlemi','Activité du compte','Действие учётной записи']
  };
  const cloudCopy={
    title:['حسابات السحابة وصلاحياتها','Cloud accounts and permissions','Bulut hesapları ve izinleri','Comptes cloud et autorisations','Облачные учётные записи и права'],
    local:['هذه حسابات WOW السحابية. يتحقق السيرفر من صلاحيات كل طلب وتُطبّق تغييرات الوصول على الجلسات المتصلة.','These are WOW cloud accounts. The server checks each request and applies access changes to connected sessions.','Bunlar WOW bulut hesaplarıdır. Sunucu her isteğin izinlerini denetler ve erişim değişikliklerini bağlı oturumlara uygular.','Il s’agit des comptes cloud WOW. Le serveur vérifie chaque requête et applique les changements d’accès aux sessions connectées.','Это облачные учётные записи WOW. Сервер проверяет каждый запрос и применяет изменения доступа к подключённым сеансам.'],
    endSessions:['إنهاء الجلسات السحابية','End cloud sessions','Bulut oturumlarını sonlandır','Fermer les sessions cloud','Завершить облачные сеансы'],
    resetHint:['سيُطلب تسجيل الدخول مجددًا من الجلسات السحابية الأخرى لهذا الحساب.','Other cloud sessions for this account will need to sign in again.','Bu hesabın diğer bulut oturumlarında yeniden giriş gerekir.','Les autres sessions cloud de ce compte devront se reconnecter.','В других облачных сеансах потребуется новый вход.'],
    revokeHint:['سيُسحب الدخول السحابي. تبقى بيانات الحساب وسجل نشاطه.','Cloud access will be revoked. The account and its activity history are kept.','Bulut erişimi kaldırılır. Hesap ve işlem geçmişi korunur.','L’accès cloud sera révoqué. Le compte et son historique sont conservés.','Доступ к облаку будет отозван. Учётная запись и история сохранятся.'],
    sessionsHint:['تتطلب الجلسات السحابية لهذا الحساب تسجيل الدخول مجددًا. تبقى صلاحياته كما هي.','Cloud sessions for this account must sign in again. Its permissions remain the same.','Bu hesabın bulut oturumlarında yeniden giriş gerekir. İzinler değişmez.','Les sessions cloud devront se reconnecter. Les autorisations restent identiques.','Облачным сеансам потребуется новый вход. Права остаются прежними.']
  };
  const lang = () => locales.includes(document.documentElement.lang) ? document.documentElement.lang : 'ar';
  const t = key => ((root.WFCloudClient?.isRemoteMode()&&cloudCopy[key]) || copy[key] || copy.event_unknown)[locales.indexOf(lang())];
  const policy = () => root.WFAccountPolicy;
  const sections = () => policy()?.sections || [];
  const actions = () => policy()?.actions || ['view','edit','delete','print','export'].map(id => ({id}));
  const roles = () => policy()?.roles || [];
  const caption = entry => entry?.titles?.[lang()] || entry?.titles?.en || entry?.id || '';
  const actionText = id => caption(actions().find(entry => entry.id === id)) || t(id === 'edit' ? 'editAction' : id === 'delete' ? 'deleteAction' : id);
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  };
  const label = (tag, key, className) => {
    const node = make(tag, className, t(key)); node.dataset.wfAccountText = key; return node;
  };
  const symbol = name => {
    const node = make('span', 'wf-account-icon'); node.setAttribute('aria-hidden', 'true');
    const paths = {
      users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
      lock:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>',
      plus:'<path d="M12 5v14M5 12h14"/>'
    };
    node.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" focusable="false">' + (paths[name] || paths.users) + '</svg>';
    return node;
  };
  const button = (key, handler, primary = false, id = '') => {
    const node = make('button', 'btn ' + (primary ? 'btn-p' : 'btn-s'));
    node.type = 'button'; if (id) node.id = id;
    node.append(label('span', key)); node.addEventListener('click', handler); return node;
  };
  const panel = make('section', 'wf-accounts');
  panel.id = 'stab-accounts'; panel.style.display = 'none'; panel.setAttribute('aria-labelledby', 'wf-settings-tab-accounts');
  const tab = make('button', 'tab-btn'); tab.id = 'wf-settings-tab-accounts'; tab.type = 'button';
  tab.setAttribute('onclick', "switchTab('accounts')"); tab.setAttribute('aria-controls', panel.id);
  const tabLabel = label('span', 'title'); tab.append(symbol('users'), tabLabel);
  workspace.querySelector('.tabs').append(tab); workspace.querySelector('.wf-settings-content').append(panel);
  let service = null, connection = null, unsubscribe = null, snapshot = {configured:false,accounts:[],audit:[],currentAccount:null};
  let loaded = false, loadFailed = false, busy = false, renderAfterOperation = false, view = 'list', selectedId = null, query = '', statusFilter = 'current';
  let draft = null, baseline = '', originalRecord = '', stale = false, message = '', error = false, form = null, formSave = null, formCancel = null;
  let fields = {}, secrets = [], notice = null, preview = null, permissionGrid = null, customLabel = null, confirmation = null, activityLimit = 20, listLimit = 30;
  const disabledBeforeBusy = new Map();
  const find = id => snapshot.accounts?.find(account => account.id === id);
  const current = () => snapshot.currentAccount;
  const canManage = () => !!current() && (policy()?.can?.(current(), 'accounts.edit') ?? current().role === 'owner');
  const canDelete = () => !!current() && (policy()?.can?.(current(), 'accounts.delete') ?? current().role === 'owner');
  const fingerprint = account => JSON.stringify(account ? {
    id:account.id,name:account.name,username:account.username,role:account.role,permissions:account.permissions,
    department:account.department,note:account.note,expiresAt:account.expiresAt,status:account.status,updatedAt:account.updatedAt,sessionVersion:account.sessionVersion
  } : null);
  const isOpen = () => page.classList.contains('active') && panel.style.display !== 'none' && (document.getElementById('wfSettingsDialog')?.open ?? true);
  const dirty = () => !!draft && (JSON.stringify(draft) !== baseline || secrets.some(input => !!input.value));
  const normalize = (role, permissions) => policy()?.normalizePermissions?.(role, permissions) || permissions || [];
  const presets = role => policy()?.presets?.(role) || [];
  const announce = () => {
    root.dispatchEvent?.(new root.CustomEvent('wf-settings-actions-change'));
    root.WFAppUpdates?.registerGuard?.('accounts', () => busy || dirty());
  };
  function clearSecrets() {
    for (const input of secrets) {
      input.value = ''; input.type = 'password'; input.setCustomValidity?.('');
      const toggle=input.parentElement?.querySelector('button'),caption=toggle?.firstElementChild;
      if(caption){caption.dataset.wfAccountText='showPassword';caption.textContent=t('showPassword');}
      toggle?.setAttribute('aria-pressed','false');
      if(toggle)toggle.setAttribute('aria-label',t('showPassword')+' · '+t(input.dataset.passwordTitle||'password'));
    }
  }
  function clearEditor() { clearSecrets(); draft = null; baseline = ''; originalRecord = ''; stale = false; fields = {}; secrets = []; form = null; formSave = null; formCancel = null; preview = null; permissionGrid = null; customLabel = null; }
  function date(value, empty = 'unknownActor') {
    if (!value) return t(empty);
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat(lang(), {dateStyle:'medium',timeStyle:'short'}).format(parsed) : t(empty);
  }
  function dateInput(value) {
    if (!value) return '';
    const parsed = new Date(value); if (!Number.isFinite(parsed.getTime())) return '';
    return parsed.getFullYear() + '-' + String(parsed.getMonth()+1).padStart(2,'0') + '-' + String(parsed.getDate()).padStart(2,'0');
  }
  const expiryISO = value => value ? new Date(value + 'T23:59:59.999').toISOString() : null;
  const expired = account => !!account?.expiresAt && Date.parse(account.expiresAt) <= Date.now();
  const statusOf = account => account.status === 'active' && expired(account) ? 'expired' : account.status;
  function badge(account) {
    const key = statusOf(account);
    const node = label('span', copy[key] ? key : 'suspended', 'wf-account-badge'); node.dataset.status = key; return node;
  }
  function translatedPolicy(tag, entry, className, kind) {
    const node = make(tag, className, caption(entry)); if (entry) node.dataset['wfAccount' + kind] = entry.id; return node;
  }
  function noticeText() {
    if (!notice) return;
    notice.hidden = !message; notice.dataset.error = String(error); notice.textContent = message ? t(message) : '';
    notice.setAttribute('role', error ? 'alert' : 'status');
  }
  function setMessage(key, failed = false) { message = key; error = failed; noticeText(); announce(); }
  const errorKeys = {
    INVALID_NAME:'invalidName',INVALID_USERNAME:'invalidUsername',INVALID_PASSWORD:'passwordLength',INVALID_ROLE:'invalidRole',
    CUSTOMER_PRINCIPAL_ROLE_FIXED:'customerPrincipalRoleFixed',
    INVALID_EXPIRY:'invalidExpiry',USERNAME_EXISTS:'duplicate',ALREADY_CONFIGURED:'conflict',AUTH_REQUIRED:'locked',
    PERMISSION_DENIED:'denied',ACCOUNT_NOT_FOUND:'missing',SELF_PROTECTION:'selfProtected',LAST_OWNER:'selfProtected',
    CONFLICT:'conflict',LOGIN_FAILED:'passwordIncorrect',CURRENT_PASSWORD_REQUIRED:'passwordIncorrect',INVALID_CURRENT_PASSWORD:'passwordIncorrect',
    INVALID_STATUS:'failed',INVALID_CHANGE:'failed',STORAGE_ERROR:'failed',CRYPTO_UNAVAILABLE:'cryptoUnavailable'
  };
  function renderFrame() {
    panel.replaceChildren();
    const scope = make('div', 'wf-account-scope'); scope.append(symbol('lock'), label('p', 'local')); panel.append(scope);
    notice = make('p', 'wf-account-notice'); notice.setAttribute('aria-live','polite'); panel.append(notice); noticeText();
  }
  function accountMetrics(permissions, container) {
    container.replaceChildren();
    for (const action of ['view','edit','print']) {
      const count = sections().filter(section => permissions.includes(section.id + '.' + action)).length;
      const metric = make('span', 'wf-account-metric');
      metric.append(make('b', '', new Intl.NumberFormat(lang()).format(count)), make('span', '', actionText(action)));
      container.append(metric);
    }
  }
  function renderList() {
    clearEditor(); view = 'list'; confirmation = null;
    const toolbar = make('div', 'wf-account-toolbar');
    const search = make('input', 'fi'); search.id = 'wfAccountsSearch'; search.type = 'search'; search.autocomplete = 'off'; search.dir = 'auto'; search.value = query;
    const filter = make('select', 'fi'); filter.id = 'wfAccountsStatus';
    for (const key of ['current','all','active','suspended','revoked','expired','deleted']) {
      const option = label('option', key === 'current' ? 'currentAccounts' : key); option.value = key;
      filter.append(option);
    }
    filter.value = statusFilter;
    const searchField = make('label', 'wf-account-field'); searchField.append(label('span','search'),search);
    const filterField = make('label', 'wf-account-field'); filterField.append(label('span','status'),filter);
    const add = button('add', () => openEditor(), true, 'wfAccountsAdd'); add.prepend(symbol('plus'));
    toolbar.append(searchField, filterField, add); panel.append(toolbar);
    const list = make('div', 'wf-account-list'); list.id = 'wfAccountsList'; list.setAttribute('role','list');
    const count = make('p','wf-account-list-count'); count.setAttribute('role','status'); count.setAttribute('aria-live','polite');
    const more = button('more', () => { listLimit += 30; draw(); }); panel.append(count,list,more);
    function draw() {
      const needle = query.trim().toLocaleLowerCase(lang());
      const rows = (snapshot.accounts || []).filter(account => {
        if (statusFilter === 'current' && account.status === 'deleted') return false;
        if (!['current','all'].includes(statusFilter) && statusOf(account) !== statusFilter) return false;
        return !needle || [account.name,account.username,account.department].some(value => String(value || '').toLocaleLowerCase(lang()).includes(needle));
      }).sort((a,b) => (a.status === 'deleted') - (b.status === 'deleted') || String(a.name).localeCompare(String(b.name),lang()));
      list.replaceChildren(); count.textContent = t('title') + ' · ' + new Intl.NumberFormat(lang()).format(rows.length);
      for (const account of rows.slice(0,listLimit)) {
        const row = make('article','wf-account-row'); row.setAttribute('role','listitem'); row.dataset.accountId = account.id;
        const identity = make('div','wf-account-row-identity');
        const avatar = make('span','wf-account-avatar',Array.from(String(account.name || '?').trim()).slice(0,2).join('')); avatar.setAttribute('aria-hidden','true');
        const names = make('div'); const name = make('h3','',account.name); name.dir = 'auto';
        const login = make('bdi','wf-account-username',account.username); names.append(name,login);
        if (account.department) { const department = make('small','wf-account-muted',account.department); department.dir = 'auto'; names.append(department); }
        identity.append(avatar,names);
        const meta = make('div','wf-account-row-meta'); meta.append(translatedPolicy('span',roles().find(role => role.id === account.role),'wf-account-role','Role'),badge(account));
        const metrics = make('div','wf-account-metrics'); accountMetrics(normalize(account.role,account.permissions),metrics);
        const last = make('p','wf-account-last',t('lastLogin') + ': ' + date(account.lastLoginAt,'never'));
        const open = button('details',() => openDetails(account.id)); open.setAttribute('aria-label',t('details') + ' · ' + account.name);
        row.append(identity,meta,metrics,last,open); list.append(row);
      }
      if (!rows.length) {
        const empty = make('div','wf-account-empty'); empty.append(symbol('users'),label('p','none'));
        if (query || statusFilter !== 'current') empty.append(button('showAll',() => { query='';statusFilter='current';listLimit=30;render(); }));
        list.append(empty);
      }
      more.hidden = rows.length <= listLimit;
    }
    search.addEventListener('input',() => { query=search.value; listLimit=30; draw(); });
    filter.addEventListener('change',() => { statusFilter=filter.value; listLimit=30; draw(); });
    draw();
  }
  function field(key, title, options = {}) {
    const group = make('label','wf-account-field' + (options.wide ? ' wf-account-wide' : ''));
    group.append(label('span',title));
    const input = make(options.tag || 'input', 'fi'); input.id = 'wfAccount-' + key; input.name = key;
    if (options.tag !== 'textarea' && options.tag !== 'select') input.type = options.type || 'text';
    if (options.required) input.required = true;
    if (options.max) input.maxLength = options.max;
    if (options.autocomplete) input.autocomplete = options.autocomplete;
    input.dir = options.dir || 'auto';
    if (options.tag === 'textarea') input.rows = 3;
    if (options.value != null) input.value = options.value;
    group.append(input); fields[key] = input;
    if (options.hint) { const hint = label('small',options.hint,'wf-account-muted'); hint.id=input.id+'Hint'; input.setAttribute('aria-describedby',hint.id); group.append(hint); }
    return group;
  }
  function passwordField(key,title,currentPassword = false) {
    const group = make('label','wf-account-field'); group.append(label('span',title));
    const wrap = make('div','wf-account-password');
    const input = make('input','fi'); input.id='wfAccount-'+key; input.name=key; input.type='password'; input.required=true; input.minLength=12;input.dataset.passwordTitle=title;
    input.maxLength=256; input.autocomplete=currentPassword?'current-password':'new-password'; input.spellcheck=false;
    const toggle=button('showPassword',() => {
      input.type=input.type==='password'?'text':'password';
      const key=input.type==='password'?'showPassword':'hidePassword';
      toggle.firstElementChild.dataset.wfAccountText=key; toggle.firstElementChild.textContent=t(key);
      toggle.setAttribute('aria-pressed',String(input.type==='text'));
      toggle.setAttribute('aria-label',t(key)+' · '+t(title));
    });
    toggle.setAttribute('aria-controls',input.id); toggle.setAttribute('aria-label',t('showPassword')+' · '+t(title)); toggle.setAttribute('aria-pressed','false');
    wrap.append(input,toggle); group.append(wrap); fields[key]=input; secrets.push(input);
    input.addEventListener('input',() => {
      input.setCustomValidity?.('');
      fields.confirmPassword?.setCustomValidity?.('');
      if (Array.from(input.value).length>128) input.setCustomValidity?.(t('passwordLength'));
      announce();
    });
    return group;
  }
  function editorFooter(saveKey) {
    const row=make('div','wf-account-editor-actions');
    formSave=button(saveKey,saveEditor,true,'wfAccountSave');
    formCancel=button('cancel',cancelEditor,false,'wfAccountCancel');
    row.append(formCancel,formSave); form.append(row);
    form.addEventListener('submit',event => { event.preventDefault(); saveEditor(); });
  }
  function openEditor(id = null) {
    if (busy || !canManage()) return;
    const account=id?find(id):null; if (id&&!account) { setMessage('missing',true); return; }
    clearEditor(); message='';error=false;selectedId=id;view='edit';confirmation=null;
    const role=account?.role || (roles().some(entry=>entry.id==='sales')?'sales':'custom');
    draft={name:account?.name||'',username:account?.username||'',role,permissions:normalize(role,account?account.permissions:presets(role)),
      department:account?.department||'',note:account?.note||'',expiresAt:dateInput(account?.expiresAt)};
    baseline=JSON.stringify(draft); originalRecord=fingerprint(account);
    render(); fields.name?.focus({preventScroll:true}); announce();
  }
  function renderEditor(bootstrap = false) {
    if (!draft) {
      draft={name:'',username:''}; baseline=JSON.stringify(draft); view='bootstrap';
    }
    const head=make('header','wf-account-editor-head'); head.append(label('h3',bootstrap?'firstTitle':selectedId?'edit':'add'));
    if (bootstrap) head.append(label('p','firstHint','wf-account-muted'));
    else head.append(button(selectedId?'backDetails':'back',cancelEditor));
    panel.append(head); form=make('form','wf-account-editor'); form.id='wfAccountEditor'; form.autocomplete='on';
    const grid=make('div','wf-account-form-grid'); form.append(grid); panel.append(form);
    grid.append(field('name','name',{required:true,max:100,value:draft.name,autocomplete:'name'}),
      field('username','username',{required:true,max:64,value:draft.username,autocomplete:'username',hint:'usernameHint'}));
    fields.username.minLength=3; fields.username.autocapitalize='none'; fields.username.spellcheck=false;
    if (bootstrap || !selectedId) {
      grid.append(passwordField('newPassword','password'),passwordField('confirmPassword','confirmPassword'));
      grid.append(label('p','passwordHint','wf-account-muted wf-account-wide'));
    }
    if (!bootstrap) {
      grid.append(field('role','role',{tag:'select',hint:'presetHint'}),field('department','department',{max:80,value:draft.department}));
      for (const role of roles()) {
        const option=translatedPolicy('option',role,'','Role'); option.value=role.id; fields.role.append(option);
      }
      fields.role.value=draft.role;
      if (selectedId===current()?.id && draft.role==='owner') fields.role.disabled=true;
      grid.append(field('expiresAt','expiry',{type:'date',value:draft.expiresAt,hint:'expiryHint'}),field('note','note',{tag:'textarea',max:1000,value:draft.note}));
      fields.expiresAt.disabled=draft.role==='owner';
      const permissions=make('section','wf-account-permissions'); permissions.append(label('h3','permissions'),label('p','permissionsHint','wf-account-muted'));
      customLabel=label('p','customized','wf-account-customized'); permissions.append(customLabel);
      permissionGrid=make('div','wf-account-permission-grid'); permissions.append(permissionGrid);
      preview=make('section','wf-account-preview'); form.append(permissions,preview);
      fields.role.addEventListener('change',() => {
        draft.role=fields.role.value; draft.permissions=normalize(draft.role,presets(draft.role));
        if (draft.role==='owner') { draft.expiresAt='';fields.expiresAt.value=''; }
        fields.expiresAt.disabled=draft.role==='owner'; drawPermissions(); updatePreview(); changed();
      });
      drawPermissions(); updatePreview();
    }
    for (const key of bootstrap?['name','username']:['name','username','department','note','expiresAt']) {
      fields[key].addEventListener(key==='expiresAt'?'change':'input',() => { draft[key]=fields[key].value;changed(); });
    }
    editorFooter(bootstrap?'createOwner':'save');
  }
  function changed() { if (message && !stale) { message='';error=false;noticeText(); } announce(); }
  function drawPermissions() {
    if (!permissionGrid || !draft) return;
    permissionGrid.replaceChildren();
    const owner=draft.role==='owner', head=make('div','wf-account-permission-head');
    head.append(label('strong','permissions'));
    for (const action of actions()) head.append(make('span','',actionText(action.id)));
    permissionGrid.append(head);
    if (owner) permissionGrid.append(label('p','ownerPermissions','wf-account-owner-note'));
    for (const section of sections()) {
      const row=make('div','wf-account-permission-row'); row.dataset.section=section.id;
      const identity=make('div','wf-account-permission-name'); identity.append(translatedPolicy('strong',section,'','Section'));
      if (section.ownerOnly) identity.append(label('small','ownerOnly','wf-account-muted')); row.append(identity);
      for (const action of actions()) {
        const key=section.id+'.'+action.id, cell=make('label','wf-account-permission-cell');
        const text=make('span','wf-account-action-label',actionText(action.id)); text.dataset.wfAccountAction=action.id;
        if (!(section.actions || []).some(value => (typeof value==='string'?value:value.id)===action.id)) {
          const empty=make('span','wf-account-unavailable','—'); empty.setAttribute('aria-label',t('notAvailable'));
          cell.append(empty,text); cell.classList.add('wf-account-permission-unavailable');
        } else {
          const input=make('input'); input.type='checkbox'; input.id='wfAccountPermission-'+section.id+'-'+action.id;
          input.checked=draft.permissions.includes(key);
          input.disabled=owner || !!section.ownerOnly || policy()?.permittedForRole?.(draft.role,key)===false ||
            (action.id!=='view'&&!draft.permissions.includes(section.id+'.view'));
          input.setAttribute('aria-label',caption(section)+' · '+actionText(action.id)); input.dataset.permission=key;
          input.addEventListener('change',() => {
            const values=new Set(draft.permissions); input.checked?values.add(key):values.delete(key);
            draft.permissions=normalize(draft.role,[...values]);
            const focusId=input.id; drawPermissions(); updatePreview(); document.getElementById(focusId)?.focus({preventScroll:true}); changed();
          });
          cell.append(input,text);
        }
        row.append(cell);
      }
      permissionGrid.append(row);
    }
  }
  function renderPermissionPreview(container,role,permissions) {
    const granted=normalize(role,permissions); container.replaceChildren();
    container.append(label('h3','preview'));
    const metrics=make('div','wf-account-preview-metrics');
    for (const action of actions()) {
      const count=sections().filter(section=>granted.includes(section.id+'.'+action.id)).length;
      const item=make('div'); item.append(make('strong','',new Intl.NumberFormat(lang()).format(count)),make('span','',actionText(action.id)));metrics.append(item);
    }
    container.append(metrics);
    const allowed=make('div','wf-account-allowed'); let any=false;
    for (const section of sections()) {
      const permitted=(section.actions||[]).map(value=>typeof value==='string'?value:value.id).filter(action=>granted.includes(section.id+'.'+action));
      if (!permitted.length) continue; any=true;
      const line=make('div'); line.append(translatedPolicy('strong',section,'','Section'));
      const tags=make('div','wf-account-permission-tags');
      for (const action of permitted) { const tag=make('span','',actionText(action));tag.dataset.wfAccountAction=action;tags.append(tag); }
      line.append(tags);allowed.append(line);
    }
    if (!any) allowed.append(label('p','noPermissions','wf-account-muted'));
    container.append(allowed);
    const denied=sections().filter(section=>!granted.includes(section.id+'.view'));
    const hidden=make('details','wf-account-hidden');hidden.append(label('summary','hiddenSections'));
    const tags=make('div','wf-account-permission-tags');
    for (const section of denied) tags.append(translatedPolicy('span',section,'','Section'));
    hidden.append(denied.length?tags:label('p','noHidden','wf-account-muted'));container.append(hidden);
  }
  function updatePreview() {
    if (!preview || !draft) return;
    renderPermissionPreview(preview,draft.role,draft.permissions);
    if (customLabel) customLabel.hidden=JSON.stringify([...draft.permissions].sort())===JSON.stringify([...normalize(draft.role,presets(draft.role))].sort());
  }
  function openPassword(id) {
    if (busy || !canManage()) return;
    const account=find(id); if (!account) return;
    clearEditor(); selectedId=id;view='password';message='';error=false;confirmation=null;
    draft={accountId:id}; baseline=JSON.stringify(draft);originalRecord=fingerprint(account);render();
    (fields.currentPassword||fields.newPassword)?.focus({preventScroll:true});announce();
  }
  function renderPassword() {
    const account=find(selectedId); if (!account) {clearEditor();view='list';setMessage('missing',true);renderList();return;}
    const head=make('header','wf-account-editor-head');head.append(label('h3','resetPassword'),make('bdi','wf-account-muted',account.name),button('backDetails',cancelEditor));panel.append(head);
    form=make('form','wf-account-editor');form.id='wfAccountPasswordEditor';panel.append(form);
    form.append(label('p','resetHint','wf-account-muted'));
    const grid=make('div','wf-account-form-grid');
    if (selectedId===current()?.id) grid.append(passwordField('currentPassword','currentPassword',true));
    grid.append(passwordField('newPassword','newPassword'),passwordField('confirmPassword','confirmPassword'));
    form.append(grid,label('p','passwordHint','wf-account-muted'));editorFooter('resetPassword');
  }
  function cancelEditor() {
    if (busy) return;
    clearEditor(); message='';error=false;confirmation=null;
    view=selectedId&&find(selectedId)?'detail':'list';render();announce();
  }
  function checkPasswords() {
    const password=fields.newPassword?.value || '';
    if (Array.from(password).length<12 || Array.from(password).length>128) { fields.newPassword?.setCustomValidity?.(t('passwordLength'));fields.newPassword?.reportValidity?.();return false; }
    if (password!==fields.confirmPassword?.value) { fields.confirmPassword?.setCustomValidity?.(t('passwordMismatch'));fields.confirmPassword?.reportValidity?.();return false; }
    fields.newPassword?.setCustomValidity?.('');fields.confirmPassword?.setCustomValidity?.('');return true;
  }
  async function saveEditor() {
    if (busy || !draft || !service || stale) { if(stale)setMessage('stale',true);return; }
    for(const key of ['name','username','department','note','expiresAt'])if(fields[key]&&Object.hasOwn(draft,key))draft[key]=fields[key].value;
    if (form?.reportValidity && !form.reportValidity()) return;
    if (secrets.length&&!checkPasswords()) return;
    if (selectedId && fingerprint(find(selectedId))!==originalRecord) {stale=true;setMessage('stale',true);return;}
    const operation=view,id=selectedId,username=draft.username;
    const payload=operation==='edit'?{name:draft.name,username:draft.username,role:draft.role,permissions:[...draft.permissions],
      department:draft.department,note:draft.note,expiresAt:expiryISO(draft.expiresAt)}:null;
    let password=fields.newPassword?.value || '',oldPassword=fields.currentPassword?.value || '';
    try {
      await perform(async()=> {
        if (operation==='bootstrap') return service.bootstrapOwner({name:draft.name,username:draft.username,password});
        if (operation==='password') return id===current()?.id?service.changePassword(oldPassword,password):service.setPassword(id,password);
        return id?service.updateAccount(id,payload):service.createAccount({...payload,password});
      }, result=> {
        selectedId=id || result.accounts?.find(account=>String(account.username).toLocaleLowerCase()===String(username).trim().toLocaleLowerCase())?.id || result.currentAccount?.id || null;
        clearEditor();view=selectedId?'detail':'list';message=operation==='password'?'passwordSaved':'saved';error=false;
      });
    } finally {password='';oldPassword='';clearSecrets();announce();}
  }
  function busyState(value) {
    if (value) {
      disabledBeforeBusy.clear();
      for (const node of panel.querySelectorAll('button,input,select,textarea')) {disabledBeforeBusy.set(node,node.disabled);node.disabled=true;}
    } else {for(const [node,wasDisabled] of disabledBeforeBusy)node.disabled=wasDisabled;disabledBeforeBusy.clear();}
    panel.setAttribute('aria-busy',String(value));announce();
  }
  async function perform(action,success) {
    if(busy)return false;busy=true;message='';error=false;noticeText();busyState(true);
    let completed=false;
    try {
      const result=await action();snapshot=result?.accounts?result:service.getSnapshot();clearSecrets();success?.(snapshot);completed=true;
    } catch(cause) {message=errorKeys[cause?.code || cause?.message] || 'failed';error=true;}
    finally {
      busy=false;busyState(false);
      if(completed||renderAfterOperation)render();else noticeText();
      announce();
    }
    return completed;
  }
  function openDetails(id) {
    if(busy)return;clearEditor();selectedId=id;view='detail';confirmation=null;activityLimit=20;message='';error=false;render();announce();
  }
  function detailFact(list,key,value) {
    const group=make('div');group.append(label('dt',key),make('dd','',value || '—'));list.append(group);
  }
  function activityLabel(action) {
    if(copy['event_'+action])return t('event_'+action);
    const separator=String(action||'').lastIndexOf('.');
    const section=sections().find(entry=>entry.id===String(action).slice(0,separator));
    const operation=String(action).slice(separator+1);
    return section&&actions().some(entry=>entry.id===operation)?caption(section)+' · '+actionText(operation):t('event_unknown');
  }
  function renderDetails() {
    const account=find(selectedId);
    if(!account){view='list';setMessage('missing',true);renderList();return;}
    const head=make('header','wf-account-detail-head');
    const identity=make('div'); const name=make('h3','',account.name);name.dir='auto';identity.append(name,make('bdi','wf-account-username',account.username));
    const controls=make('div','wf-account-detail-buttons');controls.append(button('back',()=>{selectedId=null;view='list';message='';render();announce();}));
    if(account.status!=='deleted')controls.append(button('edit',()=>openEditor(account.id),true,'wfAccountEdit'));
    head.append(identity,badge(account),controls);panel.append(head);
    const details=make('section','wf-account-details');details.append(label('h3','overview'));
    const facts=make('dl','wf-account-facts');
    detailFact(facts,'role',caption(roles().find(role=>role.id===account.role)));detailFact(facts,'department',account.department);
    detailFact(facts,'created',date(account.createdAt));detailFact(facts,'lastUpdated',date(account.updatedAt));
    detailFact(facts,'lastLogin',date(account.lastLoginAt,'never'));detailFact(facts,'expiry',account.expiresAt?date(account.expiresAt):t('noExpiry'));
    if(account.lockedUntil && Date.parse(account.lockedUntil)>Date.now())detailFact(facts,'lockedUntil',date(account.lockedUntil));
    details.append(facts);
    if(account.note){const note=make('div','wf-account-admin-note');note.append(label('strong','note'),make('p','',account.note));note.lastElementChild.dir='auto';details.append(note);}
    panel.append(details);
    const permissions=make('section','wf-account-preview');renderPermissionPreview(permissions,account.role,account.permissions);panel.append(permissions);
    const sessions=make('section','wf-account-sessions');sessions.append(label('h3','session'),label('p',account.id===current()?.id?'currentSession':'otherSession'),label('small','sessionHint','wf-account-muted'));
    sessions.append(label('p',account.role==='owner'?'ownerSessionHint':'employeeSessionHint'));
    if(account.status!=='deleted'){
      const controls=make('div','wf-account-inline-actions');controls.append(button('resetPassword',()=>openPassword(account.id),false,'wfAccountPassword'),button('endSessions',()=>ask('sessions',account.id),false,'wfAccountEndSessions'));sessions.append(controls);
    }
    panel.append(sessions);
    const life=make('section','wf-account-lifecycle');life.append(label('h3','lifecycle'));
    const buttons=make('div','wf-account-inline-actions'),self=account.id===current()?.id;
    if(account.status==='deleted')buttons.append(button('restore',()=>ask('restore',account.id)));
    else {
      if(account.status==='active'){
        const suspend=button('suspend',()=>ask('suspend',account.id));suspend.disabled=self;buttons.append(suspend);
      } else buttons.append(button('reactivate',()=>ask('reactivate',account.id)));
      if(account.status!=='revoked'){
        const revoke=button('revoke',()=>ask('revoke',account.id));revoke.disabled=self;buttons.append(revoke);
      }
      const remove=button('remove',()=>ask('delete',account.id));remove.classList.add('wf-account-danger');remove.disabled=self||!canDelete();buttons.append(remove);
    }
    life.append(buttons);
    if(self)life.append(label('small','selfProtected','wf-account-muted'));
    if(confirmation)life.append(renderConfirmation(account));panel.append(life);
    const activity=make('section','wf-account-activity');activity.append(label('h3','activity'),label('p','activityHint','wf-account-muted'));
    const events=(snapshot.audit||[]).filter(entry=>entry.targetId===account.id||entry.actorId===account.id).slice(-500).reverse();
    const list=make('ol','wf-account-events');
    for(const entry of events.slice(0,activityLimit)){
      const row=make('li');const title=make('strong','',activityLabel(entry.action));
      const when=make('time','wf-account-muted',date(entry.at));if(entry.at)when.dateTime=entry.at;
      row.append(title,when,make('small','wf-account-muted',t('by')+': '+(entry.actorName||t('unknownActor'))));
      if(entry.reason){const reason=make('p','',entry.reason);reason.dir='auto';row.append(reason);}
      if(entry.outcome==='failure')row.append(label('span','failedActivity','wf-account-failed-event'));list.append(row);
    }
    activity.append(events.length?list:label('p','noActivity','wf-account-muted'));
    if(events.length>activityLimit)activity.append(button('more',()=>{activityLimit+=20;render();}));panel.append(activity);
  }
  const confirmations={suspend:['suspend','suspendHint','suspended'],reactivate:['reactivate','reactivateHint','active'],revoke:['revoke','revokeHint','revoked'],delete:['remove','deleteHint','deleted'],restore:['restore','restoreHint'],sessions:['endSessions','sessionsHint']};
  function ask(kind,id) {if(busy)return;confirmation={kind,id};render();document.getElementById('wfAccountConfirm')?.focus({preventScroll:true});announce();}
  function renderConfirmation(account) {
    const box=make('section','wf-account-confirmation');box.setAttribute('aria-labelledby','wfAccountConfirmTitle');
    const config=confirmations[confirmation.kind];const heading=make('h4','',t(config[0])+' · '+account.name);heading.id='wfAccountConfirmTitle';
    const hint=label('p',config[1]);box.append(heading,hint);
    const reason=make('textarea','fi');reason.rows=2;reason.maxLength=300;reason.dir='auto';reason.id='wfAccountReason';
    const reasonLabel=make('label','wf-account-field');reasonLabel.append(make('span','',t('reason')+' · '+t('optional')),reason);box.append(reasonLabel);
    const actions=make('div','wf-account-inline-actions');
    const confirm=button('confirm',async()=> {
      const intent=confirmation;if(!intent)return;
      await perform(()=>intent.kind==='restore'?service.restoreAccount(intent.id):intent.kind==='sessions'?service.revokeSessions(intent.id):service.setStatus(intent.id,config[2],reason.value),
        ()=>{confirmation=null;message='updated';error=false;});
    },true,'wfAccountConfirm');
    actions.append(button('cancel',()=>{confirmation=null;render();announce();}),confirm);box.append(actions);return box;
  }
  function render() {
    if(busy)return;
    renderAfterOperation=false;
    fields={};secrets=[];form=null;formSave=null;formCancel=null;preview=null;permissionGrid=null;customLabel=null;
    renderFrame();
    if(!loaded){panel.append(label('p',loadFailed?'unavailable':'loading','wf-account-muted'));if(loadFailed)panel.append(button('retry',connect));announce();return;}
    if(!snapshot.configured){view='bootstrap';renderEditor(true);announce();return;}
    if(!current()){
      clearEditor();view='list';const empty=make('div','wf-account-empty');empty.append(symbol('lock'),label('h3','locked'),button('signIn',()=>root.WFAccountAccess?.requestLock?.(),true));panel.append(empty);announce();return;
    }
    if(!canManage()){clearEditor();panel.append(label('p','denied','wf-account-muted'));announce();return;}
    if(view==='bootstrap'){clearEditor();view='list';}
    if(view==='edit')renderEditor();
    else if(view==='password')renderPassword();
    else if(view==='detail')renderDetails();
    else renderList();
    announce();
  }
  function onSnapshot(next) {
    const previousActor=current()?.id,previousRevision=snapshot.revision; snapshot=next?.accounts?next:service.getSnapshot();
    if(previousActor===current()?.id&&previousRevision===snapshot.revision)return;
    if(previousActor!==current()?.id && loaded){clearEditor();confirmation=null;view='list';renderAfterOperation=true;}
    if(dirty() && selectedId && fingerprint(find(selectedId))!==originalRecord){stale=true;setMessage('stale',true);}
    if(!busy&&!dirty()&&isOpen())render();
  }
  async function connect() {
    if(connection)return connection;
    const access=root.WFAccountAccess;
    if(!access){loadFailed=true;if(isOpen())render();return false;}
    connection=(async()=> {
      try {
        await access.ready;service=access.service;
        if(!service || !policy())throw Error('UNAVAILABLE');
        snapshot=service.getSnapshot();loaded=true;loadFailed=false;
        unsubscribe?.();unsubscribe=service.subscribe?.(onSnapshot) || null;
        if(!dirty())render();return true;
      } catch(_){loadFailed=true;loaded=false;render();return false;}
      finally{connection=null;}
    })();
    return connection;
  }
  async function refresh() {
    if(!service)return connect();
    try {await service.refresh();snapshot=service.getSnapshot();if(!dirty()&&isOpen())render();return true;}
    catch(_){setMessage('unavailable',true);return false;}
  }
  function translate() {
    tabLabel.textContent=t('title');tabLabel.dataset.wfAccountText='title';
    if(!dirty()&&!busy){render();return;}
    for(const node of panel.querySelectorAll('[data-wf-account-text]'))node.textContent=t(node.dataset.wfAccountText);
    for(const node of panel.querySelectorAll('[data-wf-account-role]'))node.textContent=caption(roles().find(role=>role.id===node.dataset.wfAccountRole));
    for(const node of panel.querySelectorAll('[data-wf-account-section]'))node.textContent=caption(sections().find(section=>section.id===node.dataset.wfAccountSection));
    for(const node of panel.querySelectorAll('[data-wf-account-action]'))node.textContent=actionText(node.dataset.wfAccountAction);
    if(permissionGrid)drawPermissions();updatePreview();noticeText();announce();
  }
  const originalSwitch=root.switchTab;
  if(typeof originalSwitch==='function')root.switchTab=function(key){
    const result=originalSwitch.apply(this,arguments);
    panel.style.display=key==='accounts'?'block':'none';tab.classList.toggle('active',key==='accounts');
    if(key==='accounts'){if(!dirty())render();if(!loaded)connect();}
    else {clearEditor();confirmation=null;view='list';message='';error=false;}
    announce();return result;
  };
  const api={
    getSettingsActions(){
      if(!isOpen()||!form||!draft)return null;
      return {key:'accounts:'+view+':'+(selectedId||'new'),scope:panel,save:formSave,cancel:formCancel,dirty:dirty(),busy,error,canSave:!busy&&!stale&&dirty()};
    },
    hasUnsavedChanges:()=>busy||dirty(),
    refresh,
    open(){root.showPage?.('settings');tab.click();},
    get view(){return view;}
  };
  root.WFAccounts=api;
  document.addEventListener('DOMContentLoaded',()=> {
    document.getElementById('wfSettingsDialog')?.addEventListener('close',()=> {
      if(document.getElementById('wfSettingsDialog')?.open)return;
      clearEditor();confirmation=null;view='list';message='';error=false;announce();
    });
    connect();announce();
  },{once:true});
  root.addEventListener?.('pagehide',clearSecrets);
  root.addEventListener?.('wf-account-access-ready',connect);
  new root.MutationObserver(translate).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  render();connect();announce();return api;
});
