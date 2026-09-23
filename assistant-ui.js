(function () {
  'use strict';
  const C = window.WOWAssistantCore, A = window.WOWAssistantAdapter, B = window.WOWAssistantBridge, V = window.WOWAssistantVoice;
  if (!C || !A || !B || !V) return;
  const words = {
    title: ['مساعد WOW الذكي', 'WOW Akıllı Asistan', 'WOW Assistant'], subtitle: ['قل ما تريد، وراجع النتيجة قبل الحفظ', 'İsteğinizi söyleyin, kaydetmeden önce inceleyin', 'Say what you need. Review before saving.'],
    welcome: ['كيف أساعدك اليوم؟', 'Bugün nasıl yardımcı olayım?', 'What can I help you with?'], intro: ['جهّز فاتورة، سجّل دفعة، ابحث عن موديل أو اعرض حساب عميل. أراجع الأسماء معك عند التشابه.', 'Fatura hazırlayın, ödeme ekleyin, model arayın veya müşteri hesabını görün. Benzer isimlerde size sorarım.', 'Prepare invoices, record payments, find models or view customer accounts. I ask when names are ambiguous.'],
    placeholder: ['مثلاً: فاتورة لهوم سنتر، 3 قطع LUNA وعربون 200 دولار…', 'Örn. Home Centre için 3 LUNA, 200 dolar kapora…', 'E.g. Home Centre invoice, 3 LUNA units, $200 deposit…'],
    send: ['إرسال', 'Gönder', 'Send'], close: ['إغلاق', 'Kapat', 'Close'], new: ['محادثة جديدة', 'Yeni sohbet', 'New chat'], memory: ['الذاكرة', 'Hafıza', 'Memory'], connect: ['اتصال بالمساعد', 'Asistana bağlan', 'Connect assistant'], connected: ['الاتصال جاهز', 'Bağlantı hazır', 'Connection ready'], local: ['اختيارات محلية', 'Yerel seçenekler', 'Local options'], ready: ['جاهز لطلبك', 'İsteğinize hazır', 'Ready for your request'],
    privacy: ['بعد الإرسال تُستخدم رسالتك وأسماء السجلات ذات الصلة للفهم. الميكروفون اختياري وقد يستخدم خدمة المتصفح عبر الإنترنت.', 'Gönderince mesajınız ve ilgili kayıt adları yorumlanır. İsteğe bağlı mikrofon, tarayıcının çevrimiçi hizmetini kullanabilir.', 'Sending uses your message and relevant record names for interpretation. Optional voice may use your browser’s online service.'],
    draft: ['معاينة الإجراء', 'İşlem önizlemesi', 'Action preview'], empty: ['ستظهر هنا التفاصيل والخطوات. لا يُحفظ شيء قبل موافقتك.', 'Ayrıntılar ve adımlar burada görünür. Onayınız olmadan kaydedilmez.', 'Details and steps appear here. Nothing is saved before your approval.'],
    understanding: ['فهم الطلب', 'Anlama', 'Understand'], matching: ['مطابقة البيانات', 'Eşleştirme', 'Match'], reviewing: ['المعاينة', 'Önizleme', 'Review'], saving: ['الحفظ', 'Kaydetme', 'Save'], done: ['اكتمل', 'Tamamlandı', 'Done'], thinking: ['أفهم طلبك وأجهّز المعاينة…', 'İsteğinizi yorumluyorum…', 'Interpreting your request…'],
    save: ['تأكيد وحفظ', 'Onayla ve kaydet', 'Confirm and save'], cancel: ['إلغاء المسودة', 'Taslağı iptal et', 'Cancel draft'], run: ['فتح / تنفيذ', 'Aç / çalıştır', 'Open / run'], clarify: ['أحتاج توضيحًا منك', 'Bir ayrıntı gerekli', 'I need one detail'], select: ['اختر', 'Seçin', 'Choose'], noMatches: ['لا توجد نتيجة. ابحث باسم آخر أو أضف سجلًا جديدًا من قائمة المهام.', 'Sonuç yok. Başka ad arayın veya görev menüsünden kayıt ekleyin.', 'No match. Search another name or add a record from the task menu.'],
    search: ['ابحث بالاسم أو الرقم', 'Ad veya numara arayın', 'Search name or number'], confirmValue: ['اعتماد القيمة', 'Değeri kullan', 'Use value'], saved: ['تم الحفظ بنجاح', 'Başarıyla kaydedildi', 'Saved successfully'], savedInfo: ['أصبحت البيانات موجودة في البرنامج. ستُنسخ وفق إعدادات النسخ الاحتياطي الحالية.', 'Veriler programa kaydedildi. Mevcut yedekleme ayarları uygulanır.', 'The data is now in your app. Your current backup settings apply.'], canceled: ['أُلغيت المسودة دون تعديل البيانات.', 'Taslak iptal edildi. Veriler değişmedi.', 'Draft canceled. No data changed.'],
    currency: ['العملة', 'Para birimi', 'Currency'], tier: ['فئة السعر', 'Fiyat grubu', 'Price tier'], quantity: ['الكمية', 'Miktar', 'Quantity'], price: ['سعر الوحدة', 'Birim fiyat', 'Unit price'], deposit: ['العربون', 'Kapora', 'Deposit'], discount: ['الخصم', 'İndirim', 'Discount'], amount: ['المبلغ', 'Tutar', 'Amount'], total: ['الإجمالي', 'Toplam', 'Total'], remaining: ['المتبقي', 'Kalan', 'Remaining'], paid: ['المدفوع', 'Ödenen', 'Paid'], subtotal: ['قبل الضريبة', 'Vergi öncesi', 'Before tax'], tax: ['الضريبة', 'Vergi', 'Tax'], taxEnabled: ['تفعيل الضريبة', 'Vergi uygula', 'Apply tax'], yes: ['نعم', 'Evet', 'Yes'], no: ['لا', 'Hayır', 'No'],
    text_unsafe: ['استخدم نصًا عاديًا دون رموز HTML أو علامات اقتباس مزدوجة.', 'HTML veya çift tırnak içermeyen düz metin kullanın.', 'Use plain text without HTML or double quotes.'],
    date: ['التاريخ', 'Tarih', 'Date'], deliveryDate: ['موعد التسليم', 'Teslim tarihi', 'Delivery date'], loadDate: ['تاريخ التحميل', 'Yükleme tarihi', 'Loading date'], notes: ['ملاحظات', 'Notlar', 'Notes'], client: ['العميل', 'Müşteri', 'Customer'], product: ['الموديل', 'Model', 'Model'], invoice: ['الفاتورة', 'Fatura', 'Invoice'], payment: ['الدفعة', 'Ödeme', 'Payment'], name: ['الاسم', 'Ad', 'Name'], phone: ['الهاتف', 'Telefon', 'Phone'], email: ['البريد', 'E-posta', 'Email'], country: ['البلد', 'Ülke', 'Country'], city: ['المدينة', 'Şehir', 'City'], province: ['المحافظة', 'İl', 'Province'], buyerName: ['اسم المشتري', 'Alıcı', 'Buyer'], website: ['الموقع', 'Web sitesi', 'Website'], showrooms: ['عدد المعارض', 'Mağaza sayısı', 'Showrooms'], type: ['النوع', 'Tür', 'Type'], color: ['اللون', 'Renk', 'Color'], desc: ['الوصف', 'Açıklama', 'Description'], hsCode: ['الرمز الجمركي', 'GTİP', 'HS code'], weight: ['الوزن', 'Ağırlık', 'Weight'], cbm: ['الحجم م³', 'Hacim m³', 'Volume m³'], packets: ['الطرود', 'Paket', 'Packages'], dimensions: ['الأبعاد', 'Ölçüler', 'Dimensions'], priceA: ['سعر A', 'A fiyatı', 'A price'], priceB: ['سعر B', 'B fiyatı', 'B price'], priceC: ['سعر C', 'C fiyatı', 'C price'],
    create_invoice: ['فاتورة جديدة', 'Yeni fatura', 'New invoice'], update_invoice: ['تعديل فاتورة', 'Faturayı düzenle', 'Edit invoice'], add_payment: ['إضافة دفعة', 'Ödeme ekle', 'Add payment'], create_client: ['إضافة عميل', 'Müşteri ekle', 'Add customer'], update_client: ['تعديل عميل', 'Müşteriyi düzenle', 'Edit customer'], create_product: ['إضافة موديل', 'Model ekle', 'Add model'], update_product: ['تعديل موديل', 'Modeli düzenle', 'Edit model'], delete_record: ['حذف سجل', 'Kayıt sil', 'Delete record'], account_statement: ['كشف حساب عميل', 'Müşteri hesap özeti', 'Customer statement'], dashboard_summary: ['ملخص المبيعات', 'Satış özeti', 'Sales summary'], open_page: ['فتح قسم', 'Bölüm aç', 'Open section'], preview_invoice: ['عرض الفاتورة', 'Faturayı göster', 'View invoice'], export_pdf: ['تصدير PDF', 'PDF indir', 'Export PDF'], export_excel: ['تصدير Excel', 'Excel indir', 'Export Excel'], backup: ['النسخ الاحتياطي', 'Yedekleme', 'Backup'], help: ['المهام المتاحة', 'Yapabileceklerim', 'Available tasks'],
    dashboard: ['لوحة التحكم', 'Kontrol paneli', 'Dashboard'], companies: ['العملاء', 'Müşteriler', 'Customers'], products: ['المنتجات', 'Ürünler', 'Products'], invoices: ['الفواتير', 'Faturalar', 'Invoices'], 'add-company': ['إضافة عميل', 'Müşteri ekle', 'Add customer'], 'add-product': ['إضافة منتج', 'Ürün ekle', 'Add product'], 'create-invoice': ['إنشاء فاتورة', 'Fatura oluştur', 'Create invoice'], payments: ['الدفعات', 'Ödemeler', 'Payments'], settings: ['الإعدادات', 'Ayarlar', 'Settings'], 'print-settings': ['إعدادات الطباعة', 'Yazdırma ayarları', 'Print settings'], restore: ['الاستعادة', 'Geri yükleme', 'Restore'], barcode: ['الباركود', 'Barkod', 'Barcode'], language: ['اللغة', 'Dil', 'Language'], theme: ['المظهر', 'Görünüm', 'Theme'], external: ['عميل خارجي', 'Yurt dışı', 'Export customer'], internal_retail: ['محلي مفرق', 'Yurt içi perakende', 'Local retail'], internal_wholesale: ['محلي جملة', 'Yurt içi toptan', 'Local wholesale'], coffee_table: ['طاولة قهوة', 'Orta sehpa', 'Coffee table'], dresser: ['مدخل', 'Dresuar', 'Dresser'], side_table: ['طاولة جانبية', 'Yan sehpa', 'Side table'], tv_table: ['طاولة تلفاز', 'TV ünitesi', 'TV table'], other: ['أخرى', 'Diğer', 'Other'],
    mic: ['تحدث', 'Konuş', 'Speak'], stop: ['إيقاف', 'Durdur', 'Stop'], listen: ['استماع', 'Dinle', 'Listen'], voiceUnavailable: ['الإملاء الصوتي غير متاح في هذا المتصفح. يمكنك الكتابة.', 'Bu tarayıcıda sesli giriş yok. Yazabilirsiniz.', 'Voice input is unavailable in this browser. You can type.'], voiceError: ['لم يصل صوت واضح أو لم يُسمح بالميكروفون. أعد المحاولة أو اكتب طلبك.', 'Ses algılanmadı veya mikrofon izni verilmedi. Tekrar deneyin ya da yazın.', 'No speech detected or microphone permission was denied. Try again or type.'], listening: ['أستمع… راجع النص ثم أرسله', 'Dinliyorum… metni inceleyip gönderin', 'Listening… review the text, then send'],
    memoryInfo: ['هذه ذاكرة للأسماء البديلة التي اخترتها، وليست تدريبًا للنموذج. تُحفظ داخل قاعدة البرنامج وتدخل في النسخة الاحتياطية. يمكنك حذف أي ربط.', 'Seçtiğiniz ad eşleştirmeleridir; model eğitimi değildir. Program veritabanına ve yedeğe kaydedilir. İstediğiniz eşleştirmeyi silebilirsiniz.', 'This remembers name matches you chose; it does not retrain the model. It is stored in the app database and backups. You can remove any match.'], exportMemory: ['تصدير الذاكرة', 'Hafızayı dışa aktar', 'Export memory'], importMemory: ['استيراد الذاكرة', 'Hafızayı içe aktar', 'Import memory'], clearMemory: ['مسح الذاكرة', 'Hafızayı temizle', 'Clear memory'], importConfirm: ['استبدال ذاكرة الأسماء بالملف المحدد؟', 'Ad hafızası seçilen dosyayla değiştirilsin mi?', 'Replace name memory with the selected file?'], clearConfirm: ['مسح الروابط المتعلّمة؟ تبقى الفواتير والعملاء كما هي.', 'Öğrenilen adlar silinsin mi? Faturalar ve müşteriler değişmez.', 'Clear learned name matches? Invoices and customers stay unchanged.'], remember: ['تذكّر اختياراتي', 'Seçimlerimi hatırla', 'Remember my choices'], memorySaved: ['تم تحديث الذاكرة.', 'Hafıza güncellendi.', 'Memory updated.'], history: ['آخر الإجراءات المحفوظة', 'Son kaydedilen işlemler', 'Recent saved actions'], remove: ['حذف', 'Sil', 'Remove'],
    deleteWarning: ['سيُحذف هذا السجل. حذف الفاتورة يحذف الدفعات المرتبطة بها أيضًا. اكتب DELETE للتأكيد.', 'Bu kayıt silinecek. Fatura silinirse bağlı ödemeler de silinir. Onay için DELETE yazın.', 'This record will be deleted. Deleting an invoice also deletes its payments. Type DELETE to confirm.'],
    error: ['تعذّر إكمال الطلب. يمكنك تصحيح التفاصيل والمحاولة من جديد.', 'İşlem tamamlanamadı. Ayrıntıları düzeltip tekrar deneyin.', 'Could not complete the request. Correct the details and try again.'], assistant_auth_required: ['اضغط «اتصال بالمساعد» أولًا، أو استخدم الاختيارات المحلية.', 'Önce asistana bağlanın veya yerel seçenekleri kullanın.', 'Connect the assistant first, or use local options.'], assistant_unavailable: ['خدمة الفهم غير متاحة الآن. أعد المحاولة أو أكمل من الاختيارات المحلية.', 'Yorumlama hizmeti şu an kullanılamıyor. Tekrar deneyin veya yerel seçenekleri kullanın.', 'Interpretation is unavailable. Retry or use local options.'], assistant_timeout: ['استغرق الفهم وقتًا طويلًا. لم تُحفظ أي بيانات. أعد المحاولة.', 'İstek zaman aşımına uğradı. Veri kaydedilmedi. Tekrar deneyin.', 'Interpretation timed out. Nothing was saved. Retry.'], assistant_rate_limit: ['وصلت إلى حد الطلبات لهذه الساعة. الاختيارات المحلية تبقى متاحة.', 'Bu saatin istek sınırına ulaşıldı. Yerel seçenekler kullanılabilir.', 'Hourly request limit reached. Local options remain available.'], offline: ['أنت دون اتصال. استخدم الاختيارات المحلية حتى يعود الإنترنت.', 'Çevrimdışısınız. İnternet gelene kadar yerel seçenekleri kullanın.', 'You are offline. Use local options until you reconnect.'], google_not_ready: ['خدمة دخول Google لم تُحمّل بعد. تحقق من الإنترنت ثم أعد المحاولة.', 'Google girişi yüklenmedi. İnterneti kontrol edip tekrar deneyin.', 'Google sign-in has not loaded. Check your connection and retry.'], connection_cancelled: ['أُلغي الاتصال. يمكنك المحاولة مجددًا.', 'Bağlantı iptal edildi. Tekrar deneyebilirsiniz.', 'Connection canceled. You can try again.'], connection_failed: ['تعذر الاتصال. أعد اختيار حساب Google.', 'Bağlantı kurulamadı. Google hesabını tekrar seçin.', 'Connection failed. Select your Google account again.'], connection_timeout: ['انتهت مهلة الاتصال. أعد المحاولة.', 'Bağlantı zaman aşımı. Tekrar deneyin.', 'Connection timed out. Retry.'], google_token_invalid: ['انتهت جلسة Google. أعد الاتصال.', 'Google oturumu sona erdi. Yeniden bağlanın.', 'Google session expired. Reconnect.'],
    stale_preview: ['تغيّرت البيانات منذ المعاينة. اضغط «تحديث المعاينة» ثم راجع الأسعار مجددًا.', 'Önizlemeden sonra veriler değişti. Önizlemeyi yenileyip fiyatları kontrol edin.', 'Data changed since preview. Refresh the preview and review prices again.'], refresh: ['تحديث المعاينة', 'Önizlemeyi yenile', 'Refresh preview'], restore_busy: ['انتظر انتهاء الاستعادة ثم افتح المساعد مجددًا.', 'Geri yüklemenin bitmesini bekleyin.', 'Wait for restore to finish, then reopen the assistant.'], amount_invalid: ['المبلغ أو الكمية غير صالح.', 'Tutar veya miktar geçersiz.', 'Invalid amount or quantity.'], overpayment: ['العربون أو الدفعة يتجاوز المتبقي من الفاتورة.', 'Kapora veya ödeme fatura bakiyesini aşıyor.', 'Deposit or payment exceeds the invoice balance.'], discount_exceeds_total: ['الخصم أكبر من قيمة المنتجات.', 'İndirim ürün toplamını aşıyor.', 'Discount exceeds the item total.'], duplicate_name: ['هذا الاسم موجود. اختر تعديل السجل أو اسمًا مختلفًا.', 'Bu ad mevcut. Kaydı düzenleyin veya farklı ad seçin.', 'This name exists. Edit the record or choose another name.'], record_missing: ['السجل لم يعد موجودًا. أعد البحث.', 'Kayıt bulunamadı. Tekrar arayın.', 'Record no longer exists. Search again.'], client_has_invoices: ['لا يمكن حذف عميل مرتبط بفواتير.', 'Faturası olan müşteri silinemez.', 'A customer with invoices cannot be deleted.'], product_has_invoices: ['لا يمكن حذف منتج مستخدم في فواتير.', 'Faturalarda kullanılan ürün silinemez.', 'A product used in invoices cannot be deleted.'], client_invoice_mismatch: ['الفاتورة تخص عميلًا آخر.', 'Fatura başka müşteriye ait.', 'Invoice belongs to another customer.'], rate_invalid: ['راجع أسعار الصرف في إعدادات العملة.', 'Döviz ayarlarındaki kurları kontrol edin.', 'Check exchange rates in currency settings.'], invoice_empty: ['أضف منتجًا واحدًا على الأقل.', 'En az bir ürün ekleyin.', 'Add at least one item.'], date_invalid: ['التاريخ غير صحيح.', 'Geçersiz tarih.', 'Invalid date.'], memory_invalid: ['ملف الذاكرة غير صالح أو كبير جدًا.', 'Hafıza dosyası geçersiz veya çok büyük.', 'Memory file is invalid or too large.'], invoice_number_collision: ['رقم الفاتورة موجود. راجع عداد الفواتير في الإعدادات.', 'Fatura numarası mevcut. Ayarlardan sayacı kontrol edin.', 'Invoice number already exists. Check the invoice counter in settings.'], refreshRequired: ['تم الحفظ. أعد تحميل الصفحة لعرض البيانات المحدّثة.', 'Kaydedildi. Güncel veriler için sayfayı yenileyin.', 'Saved. Reload the page to display updated data.'],
    edit: ['تعديل التفاصيل', 'Ayrıntıları düzenle', 'Edit details'], addItem: ['إضافة موديل للمسودة', 'Taslağa model ekle', 'Add draft item'], chooseTask: ['اختر مهمة…', 'Görev seçin…', 'Choose task…'], choosePage: ['أقسام البرنامج', 'Program bölümleri', 'App sections'], manualInfo: ['هذه أدوات محلية منظمة؛ الفهم الحر للنص يحتاج اتصال المساعد.', 'Bunlar yapılandırılmış yerel araçlardır; serbest metin için asistan bağlantısı gerekir.', 'These are structured local tools. Free-form language needs the assistant connection.'], draftRestored: ['أعدت فتح مسودتك. راجعها قبل الحفظ.', 'Taslağınız yeniden açıldı. Kaydetmeden inceleyin.', 'Your draft was reopened. Review it before saving.'], newConfirm: ['ترك المسودة الحالية وبدء طلب جديد؟', 'Mevcut taslak bırakılıp yeni istek başlatılsın mı?', 'Leave the current draft and start a new request?'], learnedCount: ['روابط محفوظة', 'kayıtlı eşleştirme', 'saved matches'], rateNote: ['الحسابات الأساسية بالدولار وفق أسعار الصرف المعروضة.', 'Temel hesaplar gösterilen kurlarla USD olarak yapılır.', 'Base calculations use USD and the displayed exchange rates.'], speakerOn: ['الصوت يعمل', 'Ses açık', 'Voice on'], speakerOff: ['الصوت متوقف', 'Ses kapalı', 'Voice muted'], voiceModeOn: ['تحكم صوتي مستمر', 'Sürekli sesli kontrol', 'Hands-free voice'], voiceModeOff: ['تشغيل التحكم الصوتي', 'Sesli kontrolü başlat', 'Start voice control'], voiceStarted: ['أنا أستمع الآن. قل طلبك مباشرة.', 'Dinliyorum. İsteğinizi doğrudan söyleyin.', 'I am listening. Say your request directly.'], voiceStopped: ['تم إيقاف الاستماع الصوتي.', 'Sesli dinleme durduruldu.', 'Voice listening stopped.'], soundMuted: ['تم إيقاف الرد الصوتي. سأبقى صامتًا حتى تقول شغّل الصوت.', 'Sesli yanıt kapatıldı. Sesi aç diyene kadar sessiz kalacağım.', 'Voice replies are muted. I will stay silent until you say turn voice on.'], soundOn: ['تم تشغيل الرد الصوتي.', 'Sesli yanıt açıldı.', 'Voice replies are on.'], darkModeOn: ['تم تشغيل الوضع الليلي.', 'Koyu mod açıldı.', 'Dark mode is on.'], lightModeOn: ['تم تشغيل الوضع النهاري.', 'Açık mod açıldı.', 'Light mode is on.'], languageChanged: ['تم تغيير لغة البرنامج والمساعد إلى العربية.', 'Program ve asistan dili Türkçe olarak değiştirildi.', 'The app and assistant language is now English.'], invoiceLanguageChanged: ['تم تغيير لغة الفاتورة فقط.', 'Yalnızca fatura dili değiştirildi.', 'Invoice language changed only.'], nothingToSave: ['لا توجد مسودة جاهزة للحفظ الآن.', 'Şu anda kaydedilmeye hazır bir taslak yok.', 'There is no draft ready to save right now.'], nothingToRun: ['لا يوجد إجراء جاهز للتنفيذ الآن.', 'Şu anda çalıştırılacak hazır bir işlem yok.', 'There is no action ready to run right now.'], previewHere: ['المعاينة موجودة الآن في اللوحة الجانبية. يمكنك قول «احفظ» أو تعديل أي تفصيل بصوتك.', 'Önizleme yan panelde hazır. “Kaydet” diyebilir veya ayrıntıları sesle değiştirebilirsiniz.', 'The preview is ready in the side panel. Say “save” or change any detail by voice.'], openingPreview: ['سأفتح معاينة الفاتورة الآن.', 'Fatura önizlemesini açıyorum.', 'Opening the invoice preview now.'], openingAction: ['سأنفذ الإجراء الآن.', 'İşlemi şimdi çalıştırıyorum.', 'Running the action now.'], noRecentInvoice: ['لم أجد فاتورة حديثة مرتبطة بهذه المحادثة. اذكر رقم الفاتورة أو اسم العميل.', 'Bu konuşmaya bağlı son bir fatura bulamadım. Fatura numarasını veya müşteri adını söyleyin.', 'I could not find a recent invoice in this conversation. Say the invoice number or customer name.'], deleteVoiceConfirm: ['للحذف النهائي قل: تأكيد الحذف النهائي.', 'Kalıcı silme için “silme işlemini onaylıyorum” deyin.', 'For final deletion say: confirm final delete.'], voiceChoiceMiss: ['لم أتعرف على الخيار. قل اسم الخيار كما يظهر أو قل الخيار الأول أو الثاني.', 'Seçimi anlayamadım. Görünen adı veya birinci/ikinci seçeneği söyleyin.', 'I did not recognize the choice. Say its visible name, or say first or second option.'], voiceHint: ['صوت حي: قل طلبك، ثم تابع بالتعديل والحفظ والمعاينة دون لمس الشاشة.', 'Canlı ses: isteğinizi söyleyin; düzeltme, kaydetme ve önizlemeye dokunmadan devam edin.', 'Live voice: speak your request, then edit, save, and preview without touching the screen.'], share_pdf: ['مشاركة PDF', 'PDF paylaş', 'Share PDF'], share_excel: ['مشاركة Excel', 'Excel paylaş', 'Share Excel'], print_invoice: ['طباعة الفاتورة', 'Faturayı yazdır', 'Print invoice'], nativeInfo: ['سأفتح القسم المطلوب؛ أكمل التفاصيل من أدوات البرنامج.', 'İstenen bölümü açacağım; ayrıntıları program araçlarından tamamlayın.', 'I will open the section. Complete details using the app’s tools.']
  };
  Object.assign(words, {
    title: ['مساعد WOW', 'WOW Asistan', 'WOW Assistant'],
    subtitle: ['أفكارك تصبح إجراءات واضحة', 'Sözleriniz, net işlemlere dönüşür', 'Your words. Clear actions.'],
    chat: ['المحادثة', 'Sohbet', 'Conversation'], tools: ['الأدوات', 'Araçlar', 'Tools'],
    listening: ['أستمع إليك…', 'Sizi dinliyorum…', 'Listening to you…'], speaking: ['أتحدث الآن…', 'Konuşuyorum…', 'Speaking…'],
    voiceHint: ['اضغط الميكروفون مرة، ثم تحدث. قل «أوقف الصوت» لكتم الردود.', 'Mikrofona bir kez dokunun. Yanıtları susturmak için “sesi kapat” deyin.', 'Tap the mic once, then speak. Say “mute” to silence replies.'],
    confirmationHint: ['راجع التفاصيل، ثم قل «تأكيد وحفظ» أو اطلب تعديلًا.', 'Ayrıntıları inceleyin; “onayla ve kaydet” deyin veya değişiklik isteyin.', 'Review the details, then say “confirm and save” or request a change.'],
    choiceHint: ['قل رقم الخيار أو اسمه كاملًا.', 'Seçeneğin numarasını veya tam adını söyleyin.', 'Say the option number or its full name.'],
    speakingUnavailable: ['تعذّر تشغيل الصوت. اضغط زر الاستماع للمحاولة مجددًا، وتأكد من وجود صوت للغة على جهازك.', 'Ses oynatılamadı. Yeniden denemek için Dinle’ye dokunun; cihazınızda dil sesi bulunduğunu kontrol edin.', 'Audio could not play. Tap Listen to retry and check that your device has a voice for this language.'],
    voiceRetry: ['انقطع التعرف على الصوت. اضغط الميكروفون للمحاولة مجددًا.', 'Ses tanıma kesildi. Tekrar denemek için mikrofona dokunun.', 'Speech recognition stopped. Tap the microphone to retry.'],
    unsavedAction: ['هذه مسودة لم تُحفظ بعد. راجعها ثم قل «تأكيد وحفظ» قبل التصدير أو المشاركة.', 'Bu taslak kaydedilmedi. Dışa aktarmadan veya paylaşmadan önce inceleyip “onayla ve kaydet” deyin.', 'This draft is unsaved. Review it and say “confirm and save” before exporting or sharing.'],
    draftContext: ['أعدت فتح مسودة المساعد. راجعها أولًا ثم أكد الحفظ.', 'Asistan taslağı açıldı. İnceleyin, ardından kaydetmeyi onaylayın.', 'The assistant draft is open. Review it, then confirm saving.'],
    previewHere: ['هذه معاينة المسودة الحالية. يمكنك تعديلها أو تأكيد حفظها بالصوت.', 'Geçerli taslağın önizlemesi burada. Sesle düzenleyebilir veya kaydetmeyi onaylayabilirsiniz.', 'This is the current draft preview. Edit it or confirm saving by voice.'],
    voiceHelp: ['قل مثلًا: غير اللغة للإنجليزي، شغل الوضع الليلي، اعرض التفاصيل، اقرأ الفاتورة، اختر الثاني، تأكيد وحفظ، معاينة، أوقف الصوت، شغل الصوت، أو افتح الفواتير.', 'Örneğin: dili İngilizce yap, koyu modu aç, ayrıntıları göster, faturayı oku, ikinci seçenek, onayla ve kaydet, önizle, sesi kapat veya faturalar aç.', 'Try: switch to Arabic, dark mode, show details, read the invoice, option two, confirm and save, preview, mute, unmute, or open invoices.'],
    savedInfo: ['حُفظت البيانات في البرنامج. يمكنك الآن المعاينة أو التصدير أو متابعة طلب جديد.', 'Veriler kaydedildi. Önizleyebilir, dışa aktarabilir veya yeni bir istek başlatabilirsiniz.', 'Saved to your app. Preview, export, or continue with a new request.']
  });
  let lang = 'ar', dialog, chat, pane, input, status, sendBtn, micBtn, speakerBtn, voiceBadge, connectBtn, taskMenu, pagesMenu, launcher, panelTabs, toolsBtn, toolbar, transcript, voiceStateLabel;
  let history = [], command = null, selections = {}, plan = null, current = null, operationId = '', busy = false, sequence = 0, stage = '', recognition = null, listening = false, blocked = false;
  let knowledge = { examples: { ar: [], tr: [], en: [] } }, lastFocus, voiceSession = false, speechSpeaking = false, recognitionAbortReason = '', voiceRestartTimer = null, lastSavedInvoiceId = '', lastSavedIntent = '', greeted = false;
  let nativeAbort, speechEngine, micEngine, voiceErrors = 0, speechWarning = false, choiceEntries = [], backendChoices = [], selectedPanel = 'chat';
  let speechMuted = (() => { try { return localStorage.getItem('wf_ai_voice_muted_v2') === '1'; } catch (_) { return false; } })();
  const t = key => words[key]?.[['ar', 'tr', 'en'].indexOf(lang)] || words[key]?.[2] || key;
  const el = (tag, cls, text) => { const n = document.createElement(tag);if (cls) n.className = cls;if (text !== undefined) n.textContent = text;return n; };
  const button = (label, fn, cls = '') => { const n = el('button', 'wf-ai-btn ' + cls, label);n.type = 'button';n.addEventListener('click', () => { Promise.resolve().then(fn).catch(report); });return n; };
  const money = (n, cur = 'USD') => new Intl.NumberFormat(lang, { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(Number(n) || 0);
  const clean = v => JSON.parse(JSON.stringify(v));
  function setPath(target, path, value) {
    const keys = path.split('.');if (keys.some(k => ['__proto__', 'constructor', 'prototype'].includes(k))) throw new Error('request_invalid');
    let obj = target;keys.slice(0, -1).forEach((k, i) => { if (!obj[k] || typeof obj[k] !== 'object') obj[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};obj = obj[k]; });obj[keys.at(-1)] = value;
  }
  function getPath(target, path) { return path.split('.').reduce((v, k) => v?.[k], target); }
  function persist() { try { if (command) sessionStorage.setItem('wf_ai_draft_v1', JSON.stringify({ command, selections, operationId, blocked }));else sessionStorage.removeItem('wf_ai_draft_v1'); } catch (_) {} }
  function updateStatus(text) { if (!status) return;status.replaceChildren(el('span', 'wf-ai-dot' + (voiceSession ? ' live' : '')), document.createTextNode(text || (voiceSession ? t('voiceModeOn') : (B.credentials() ? t('connected') : t('local'))))); }
  function paintVoiceControls() {
    if (speakerBtn) { speakerBtn.textContent = speechMuted ? '🔇 ' + t('speakerOff') : '🔊 ' + t('speakerOn');speakerBtn.classList.toggle('muted', speechMuted);speakerBtn.setAttribute('aria-pressed', speechMuted ? 'false' : 'true');speakerBtn.title = speechMuted ? t('speakerOff') : t('speakerOn'); }
    if (micBtn) { micBtn.textContent = voiceSession ? '◉' : '◌';micBtn.classList.toggle('voice-live', voiceSession);micBtn.classList.toggle('listening', listening);micBtn.setAttribute('aria-pressed', voiceSession ? 'true' : 'false');micBtn.setAttribute('aria-label', t(voiceSession ? 'stop' : 'mic'));micBtn.title = t(voiceSession ? 'voiceModeOn' : 'voiceModeOff'); }
    if (voiceBadge) { voiceBadge.textContent = voiceSession ? '● ' + t('voiceModeOn') : '○ ' + t('voiceModeOff');voiceBadge.classList.toggle('active', voiceSession); }
    if (launcher) { launcher.classList.toggle('voice-live', voiceSession);launcher.classList.toggle('voice-muted', speechMuted);launcher.textContent = voiceSession ? '◉ WOW AI · ' + t(speechSpeaking ? 'speaking' : 'voiceModeOn') : '✦ WOW AI'; }
    const stateKey = busy ? 'thinking' : speechSpeaking ? 'speaking' : listening ? 'listening' : voiceSession ? 'voiceModeOn' : 'ready';
    if (voiceStateLabel) voiceStateLabel.textContent = t(stateKey);
    if (dialog) dialog.dataset.voice = busy ? 'thinking' : speechSpeaking ? 'speaking' : listening ? 'listening' : 'idle';
    updateStatus();
  }
  function pauseRecognition() {
    clearTimeout(voiceRestartTimer);voiceRestartTimer = null;
    micEngine?.abort();listening = false;recognition = null;
    if (transcript) { transcript.textContent = '';transcript.hidden = true; }
  }
  function scheduleVoiceRestart(delay = 360) {
    clearTimeout(voiceRestartTimer);voiceRestartTimer = null;
    if (!voiceSession || busy || speechSpeaking || !dialog || document.hidden || micEngine?.active) return;
    voiceRestartTimer = setTimeout(() => { voiceRestartTimer = null;beginRecognition(); }, delay);
  }
  function setBusy(value, text) {
    busy = value;if (sendBtn) sendBtn.disabled = value;if (connectBtn) connectBtn.disabled = value;if (taskMenu) taskMenu.disabled = value;if (pagesMenu) pagesMenu.disabled = value;
    if (value) pauseRecognition();paintVoiceControls();updateStatus(text);if (!value) scheduleVoiceRestart();
  }
  function report(error) { message('assistant', t(words[error?.message] ? error.message : 'error'), true);updateStatus(t('ready')); }
  function ensureSpeech() {
    if (speechEngine) return;
    speechEngine = V.createSpeech({ synthesis: window.speechSynthesis, Utterance: window.SpeechSynthesisUtterance }, {
      change(value) { speechSpeaking = value;if (value) pauseRecognition();paintVoiceControls();if (!value) scheduleVoiceRestart(); },
      error() { if (!speechWarning && !document.hidden) { speechWarning = true;message('assistant', t('speakingUnavailable'), true, { speak: false }); } }
    });
  }
  function stopSpeech() { speechEngine?.cancel();speechSpeaking = false;paintVoiceControls(); }
  function setSpeechMuted(value, announce = true) {
    speechMuted = !!value;try { localStorage.setItem('wf_ai_voice_muted_v2', speechMuted ? '1' : '0'); } catch (_) {}
    if (speechMuted) stopSpeech();paintVoiceControls();
    if (announce) message('assistant', t(speechMuted ? 'soundMuted' : 'soundOn'), false, { speak: !speechMuted });
    scheduleVoiceRestart();
  }
  function speak(text, options = {}) {
    const value = String(text || '').trim();
    if (!value || (speechMuted && !options.force) || document.hidden) { scheduleVoiceRestart();return Promise.resolve(false); }
    ensureSpeech();return speechEngine.speak(value, lang);
  }
  function setPanel(value) {
    selectedPanel = value === 'review' ? 'review' : 'chat';if (!dialog) return;dialog.dataset.panel = selectedPanel;
    panelTabs?.querySelectorAll('button').forEach(n => n.setAttribute('aria-selected', n.dataset.panel === selectedPanel ? 'true' : 'false'));
  }
  function toggleTools(value) {
    const open = typeof value === 'boolean' ? value : toolbar.hidden;
    toolbar.hidden = !open;toolsBtn.setAttribute('aria-expanded', String(open));
  }
  function addChoice(container, label, run) {
    const number = choiceEntries.length + 1;
    const pick = async () => { if (busy) return;await run(); };
    const node = button(number + ' · ' + label, pick);node.dataset.aiChoice = '1';choiceEntries.push({ label, pick, node });container.append(node);return node;
  }
  function syncChoices() {
    const byNode = new Map(choiceEntries.map(row => [row.node, row]));
    choiceEntries = Array.from(pane.querySelectorAll('[data-ai-choice]')).map(node => byNode.get(node)).filter(Boolean);
    choiceEntries.forEach((row,i) => { row.node.textContent = (i + 1) + ' · ' + row.label; });
  }
  function describePlan() {
    if (blocked) return t('clarify') + ' ' + choiceEntries.slice(0, 6).map((r,i) => (i + 1) + '. ' + r.label).join('. ') + ' ' + t('choiceHint');
    if (!plan) return t('nothingToRun');
    if (plan.status === 'error') return t(words[plan.error] ? plan.error : 'error');
    if (plan.status === 'clarify') {
      const q = plan.questions[0], label = q ? t(q.kind || q.key.split('.').at(-1)) : '';
      return t('clarify') + ': ' + label + '. ' + (q?.type === 'number' ? '' : choiceEntries.slice(0, 6).map((r,i) => (i + 1) + '. ' + r.label).join('. ') + (choiceEntries.length ? '. ' + t('choiceHint') : ''));
    }
    if (plan.destructive) return t('delete_record') + ': ' + (plan.record?.invNo || plan.record?.name || '') + '. ' + t('deleteVoiceConfirm');
    if (plan.record?.items) {
      const r = plan.record;return [t(plan.intent), r.companyName, ...r.items.slice(0, 4).map(v => v.name + ' × ' + v.qty),
        t('total') + ' ' + money(r.grandTotal), t('deposit') + ' ' + money(r.depositUSD), t('remaining') + ' ' + money(r.remainingUSD), t('confirmationHint')].filter(Boolean).join('. ');
    }
    if (plan.status === 'read') {
      const r = plan.result;if (r.type === 'help') return t('voiceHelp');
      if (r.type === 'search') return r.records.length ? r.records.slice(0, 6).map(row => C.label(row, r.kind)).join('. ') : t('noMatches');
      return [r.client?.name, t('invoices') + ' ' + r.count, t('total') + ' ' + money(r.invoicedUSD), t('paid') + ' ' + money(r.paidUSD), t('remaining') + ' ' + money(r.balanceUSD)].filter(Boolean).join('. ');
    }
    if (plan.status === 'native') return t(plan.intent) + '. ' + t('run');
    return t(plan.intent) + ': ' + (plan.record?.name || '') + '. ' + t('confirmationHint');
  }
  function announcePlan() { message('assistant', describePlan()); }
  function message(role, text, error = false, options = {}) {
    const value = String(text).slice(0, 2000);history.push({ role, text: value, error });history = history.slice(-24);renderChat();
    if (role === 'assistant' && options.speak !== false) speak(value);
  }
  function renderChat() {
    chat.replaceChildren();
    if (!history.length) {
      const welcome = el('div', 'wf-ai-welcome');welcome.append(el('h3', '', t('welcome')), el('p', '', t('intro')));const chips = el('div', 'wf-ai-chips');
      (knowledge.examples[lang] || []).slice(0, 3).forEach(text => chips.append(button(text, () => { input.value = text;input.focus(); })));welcome.append(chips);chat.append(welcome);
    }
    history.forEach(row => { const msg = el('div', 'wf-ai-message ' + row.role + (row.error ? ' error' : ''), row.text);if (row.role === 'assistant' && window.speechSynthesis) msg.append(button('◖ ' + t('listen'), () => speak(row.text, { force: true })));chat.append(msg); });
    chat.scrollTop = chat.scrollHeight;
  }
  function steps(active) { const row = el('div', 'wf-ai-steps');['understanding', 'matching', 'reviewing', 'saving', 'done'].forEach((k, i, keys) => row.append(el('span', 'wf-ai-step' + (i <= keys.indexOf(active) ? ' active' : '') + (busy && k === active ? ' busy' : ''), t(k))));return row; }
  function resetPane() { pane.replaceChildren(el('h3', '', t('draft')), steps(stage)); }
  function line(container, label, value, total = false) { const row = el('div', 'wf-ai-line' + (total ? ' total' : ''));row.append(el('span', '', label), el('strong', '', value));container.append(row); }
  function field(container, key, value, change, type = 'text', choices) {
    const label = el('label', 'wf-ai-label', t(key)), node = el(choices ? 'select' : type === 'textarea' ? 'textarea' : 'input');
    if (choices) choices.forEach(v => { const option = el('option', '', t(v));option.value = v;node.append(option); });else if (type !== 'textarea') { node.type = type;if (type === 'number') { node.min = '0';node.step = 'any'; } }
    node.value = value ?? '';node.addEventListener('change', () => Promise.resolve(change(type === 'number' ? C.number(node.value) : node.value)).catch(report));label.append(node);container.append(label);return node;
  }
  function mutate(path, value) { if (busy) return;setPath(command, path, value);operationId = B.id();return compile(); }
  async function compile(announce = true, requestSequence = ++sequence) {
    if (!command) return;
    plan = null;
    try {
      const result = await A.preview(command, selections);if (requestSequence !== sequence) return;
      plan = result.plan;current = result.snapshot;stage = 'reviewing';persist();renderPlan();setPanel('review');if (announce) announcePlan();
    } catch (error) {
      if (requestSequence !== sequence) return;
      stage = 'reviewing';renderPlan();throw error;
    }
  }
  async function start(value, ask = true) {
    if (busy) return;
    if (ask && command && !window.confirm(t('newConfirm'))) return;
    command = clean(value);selections = {};blocked = false;operationId = B.id();message('assistant', t(value.intent), false, { speak: false });await compile();
  }
  function cancel() {
    if (busy && stage === 'saving') return;
    sequence++;backendChoices = [];command = plan = current = null;selections = {};operationId = '';blocked = false;stage = '';setBusy(false);persist();renderPlan();message('assistant', t('canceled'));
  }
  function question(q) {
    const box = el('div', 'wf-ai-card'), label = q.kind ? t(q.kind) : t(q.key.split('.').at(-1));box.append(el('h4', '', label));
    if (q.type === 'record') {
      const search = el('input');search.type = 'search';search.value = q.query || '';search.placeholder = t('search');search.setAttribute('aria-label', t('search'));search.className = 'wf-ai-btn';search.style.width = '100%';box.append(search);
      const choices = el('div', 'wf-ai-choices');box.append(choices);
      const paint = () => {
        choices.replaceChildren();choiceEntries = choiceEntries.filter(row => row.questionKey !== q.key);const store = { client: 'companies', product: 'products', invoice: 'invoices', payment: 'payments' }[q.kind];const found = C.resolve(search.value, current[store], q.kind, current.settings.assistantMemory);const list = found.record ? [{ id: found.record.id, label: C.label(found.record, q.kind) }] : found.options;
        if (!list.length) choices.append(el('p', 'wf-ai-hint', t('noMatches')));
        list.forEach(row => { const label = row.label + (row.info ? ' · ' + row.info : '');addChoice(choices, label, async () => {
          selections[q.key] = row.id;
          if (q.key.startsWith('items.')) { const i = Number(q.key.split('.')[1]);command.items ||= [];command.items[i] ||= { query: q.query || search.value };if (!command.items[i].query) command.items[i].query = search.value; }
          else if (!q.query && search.value.trim()) command[q.key === 'target' ? 'query' : q.key + 'Query'] = search.value.trim();
          operationId = B.id();await compile();
        });choiceEntries.at(-1).questionKey = q.key; });
        if (box.isConnected) syncChoices();
      };search.addEventListener('input', paint);paint();
    } else if (q.type === 'choice') {
      const list = el('div', 'wf-ai-choices');q.options.forEach(row => addChoice(list, t(row.id), () => mutate(q.key, row.id)));box.append(list);
    } else {
      let value = getPath(command, q.key) ?? '';const control = field(box, q.key.split('.').at(-1), value, v => { value = v; }, q.type === 'number' ? 'number' : 'text');
      box.append(button(t('confirmValue'), () => mutate(q.key, q.type === 'number' ? C.number(control.value) : control.value), 'primary'));
    }
    pane.append(box);syncChoices();
  }
  function editableDetails(record) {
    const details = el('details', 'wf-ai-card'), summary = el('summary', '', t('edit'));details.append(summary);
    if (['create_invoice', 'update_invoice'].includes(command.intent)) {
      field(details, 'currency', command.currency || record?.currency || 'USD', v => mutate('currency', v), 'text', ['USD', 'EUR', 'TRY']);
      field(details, 'tier', command.tier || record?.tier || 'A', v => mutate('tier', v), 'text', ['A', 'B', 'C']);
      for (const k of ['deposit', 'discount']) {
        const currency = command[k + 'Currency'] || command.currency || record?.currency || 'USD';const rate = currency === 'USD' ? 1 : current.rates[currency === 'TRY' ? 'usdTry' : 'usdEur'];
        field(details, k, command[k] ?? C.round(Number(record?.[k + 'USD'] || 0) * rate), v => mutate(k, v), 'number');field(details, 'currency', currency, v => mutate(k + 'Currency', v), 'text', ['USD', 'EUR', 'TRY']);
      }
      field(details, 'taxEnabled', (command.taxEnabled ?? record?.kdvEnabled) ? 'yes' : 'no', v => mutate('taxEnabled', v === 'yes'), 'text', ['no', 'yes']);
      (command.items || []).forEach((item, i) => {
        const card = el('div', 'wf-ai-card');card.append(el('h4', '', item.query || t('product')));
        field(card, 'quantity', item.quantity, v => mutate('items.' + i + '.quantity', v), 'number');
        field(card, 'price', item.unitPrice ?? '', v => mutate('items.' + i + '.unitPrice', v), 'number');
        field(card, 'color', item.color || '', v => mutate('items.' + i + '.color', v));
        card.append(button(t('remove'), async () => { command.items.splice(i, 1);selections = Object.fromEntries(Object.entries(selections).filter(([k]) => !k.startsWith('items.')));operationId = B.id();await compile(); }, 'danger'));details.append(card);
      });
      details.append(button(t('addItem'), () => { command.items ||= [];command.items.push({ query: '' });operationId = B.id();return compile(); }));
      for (const k of ['date', 'deliveryDate', 'loadDate']) field(details, k, command[k] ?? record?.[k === 'date' ? 'regDate' : k] ?? '', v => mutate(k, v), 'date');
      field(details, 'notes', command.notes ?? record?.notes ?? '', v => mutate('notes', v), 'textarea');
    } else if (command.intent === 'add_payment') {
      field(details, 'amount', command.amount, v => mutate('amount', v), 'number');field(details, 'currency', command.amountCurrency || command.currency || record?.currency || 'USD', v => mutate('amountCurrency', v), 'text', ['USD', 'EUR', 'TRY']);field(details, 'date', command.date || current.today, v => mutate('date', v), 'date');field(details, 'notes', command.notes || '', v => mutate('notes', v));
    } else if (/_(client|product)$/.test(command.intent)) {
      const isProduct = command.intent.endsWith('_product');
      const keys = isProduct ? ['name', 'type', 'priceA', 'priceB', 'priceC', 'color', 'dimensions', 'packets', 'weight', 'cbm', 'hsCode', 'desc'] : ['name', 'type', 'buyerName', 'phone', 'email', 'country', 'province', 'city', 'website', 'showrooms'];
      if (isProduct) field(details, 'currency', command.currency || 'USD', v => mutate('currency', v), 'text', ['USD', 'EUR', 'TRY']);
      keys.forEach(k => { const options = k === 'type' ? isProduct ? C.types : ['external', 'internal_retail', 'internal_wholesale'] : null;const numeric = ['priceA', 'priceB', 'priceC', 'showrooms', 'packets', 'weight', 'cbm'].includes(k);field(details, k, command.fields?.[k] ?? record?.[k] ?? '', v => mutate('fields.' + k, v), numeric ? 'number' : k === 'desc' ? 'textarea' : 'text', options); });
    }
    if (details.children.length > 1) pane.append(details);
  }
  function showRecord(record) {
    const card = el('div', 'wf-ai-card');card.append(el('h4', '', record.invNo || record.name || t(command.intent)));
    if (record.items) {
      line(card, t('client'), record.companyName);line(card, t('currency'), record.currency);line(card, t('tier'), record.tier);
      record.items.forEach(item => { const row = el('div', 'wf-ai-line');row.append(el('span', '', item.name + ' × ' + item.qty), el('strong', '', money(item.totalUSD)));card.append(row); });
      line(card, t('discount'), money(record.discountUSD));line(card, t('tax'), money(record.kdvAmtUSD));line(card, t('total'), money(record.grandTotal), true);line(card, t('deposit'), money(record.depositUSD));
      if (plan.payment) line(card, t('payment'), money(plan.payment.originalAmount, plan.payment.originalCurrency));
      line(card, t('remaining'), money(record.remainingUSD), true);
      if (record.currency !== 'USD') line(card, t('total') + ' · ' + record.currency, money(record.grandTotal * current.rates[record.currency === 'TRY' ? 'usdTry' : 'usdEur'], record.currency));
      ['regDate', 'deliveryDate', 'loadDate', 'notes'].forEach(k => { if (record[k]) line(card, t(k === 'regDate' ? 'date' : k), record[k]); });
      card.append(el('p', 'wf-ai-hint', t('rateNote') + ' 1 USD = ' + current.rates.usdTry + ' TRY · ' + current.rates.usdEur + ' EUR'));
    } else Object.entries(record).filter(([k, v]) => words[k] && ['string', 'number'].includes(typeof v) && v !== '').forEach(([k, v]) => line(card, t(k), k.startsWith('price') ? money(v) : String(v)));
    pane.append(card);
  }
  function showRead(result) {
    const card = el('div', 'wf-ai-card');
    if (result.type === 'help') {
      card.append(el('p', '', t('intro')));const list = el('div', 'wf-ai-chips');C.intents.filter(k => k !== 'help').forEach(k => list.append(button(t(k), () => start({ intent: k }, false))));card.append(list);
    } else if (result.type === 'search') {
      field(card, 'type', command.target || 'product', v => mutate('target', v), 'text', ['client', 'product', 'invoice', 'payment']);
      field(card, 'search', command.query || command.productQuery || command.clientQuery || command.invoiceQuery || '', v => mutate('query', v));
      card.append(el('h4', '', t(result.kind)));if (!result.records.length) card.append(el('p', '', t('noMatches')));
      result.records.forEach(row => { const block = el('div', 'wf-ai-card');block.append(el('h4', '', C.label(row, result.kind)));if (result.kind === 'product') line(block, t('price'), money(row.priceA || row.priceUSD));if (result.kind === 'client') { line(block, t('phone'), row.phone || '—');block.append(button(t('account_statement'), () => start({ intent: 'account_statement', clientQuery: row.name }, false))); }if (result.kind === 'invoice') block.append(button(t('preview_invoice'), () => native({ action: 'preview_invoice', id: row.id })));card.append(block); });
    } else {
      card.append(el('h4', '', result.client?.name || t('dashboard_summary')));line(card, t('invoices'), result.count);line(card, t('total'), money(result.invoicedUSD));line(card, t('paid'), money(result.paidUSD));line(card, t('remaining'), money(result.balanceUSD), true);
      const table = el('table', 'wf-ai-table'), header = el('tr');[t('invoice'), t('total'), t('remaining')].forEach(v => header.append(el('th', '', v)));const head = el('thead');head.append(header);table.append(head);const body = el('tbody');
      (result.invoices || []).forEach(row => { const tr = el('tr'), ref = el('td');ref.append(button(row.invNo || '—', () => native({ action: 'preview_invoice', id: row.id })));tr.append(ref, el('td', '', money(row.totalUSD)), el('td', '', money(row.remainingUSD)));body.append(tr); });table.append(body);card.append(table);
    }pane.append(card);
  }
  async function native(action) { const keepVoice = voiceSession;await A.native(action);close(keepVoice); }
  async function save(deleteValue) {
    if (busy || !plan || blocked) return;
    if (plan.destructive && deleteValue !== 'DELETE') return;
    const approved = plan;setBusy(true, t('saving'));stage = 'saving';renderPlan();
    try {
      const result = await A.commit(approved, operationId, { confirmed: true, deleteConfirmed: approved.destructive && deleteValue === 'DELETE' });
      if (result.store === 'invoices' && result.recordId) lastSavedInvoiceId = approved.destructive ? '' : result.recordId;lastSavedIntent = approved.intent || '';
      command = plan = null;selections = {};blocked = false;choiceEntries = [];backendChoices = [];persist();stage = 'done';resetPane();setPanel('review');
      const card = el('div', 'wf-ai-card wf-ai-success');card.append(el('div', 'check', '✓'), el('h3', '', t('saved')), el('p', '', t(result.refreshRequired ? 'refreshRequired' : 'savedInfo')));
      if (!approved.destructive && result.store === 'invoices') card.append(button(t('preview_invoice'), () => native({ action: 'preview_invoice', id: result.recordId }), 'primary'));
      pane.append(card);message('assistant', t('saved') + (approved.record?.invNo ? ' · ' + approved.record.invNo : ''));
    } catch (e) { stage = 'reviewing';renderPlan();report(e);if (e.message === 'stale_preview') pane.append(button(t('refresh'), compile, 'primary')); }
    finally { setBusy(false); }
  }
  function renderPlan() {
    choiceEntries = [];resetPane();
    if (!plan) { const empty = el('div', 'wf-ai-empty');empty.append(el('b', '', '✦'), document.createTextNode(t('empty')));pane.append(empty);return; }
    if (blocked) { pane.append(el('p', 'wf-ai-warning', t('clarify')));const choices = el('div', 'wf-ai-choices');backendChoices.forEach(r => addChoice(choices, r.label, () => send(r.message)));pane.append(choices, button(t('cancel'), cancel));syncChoices();return; }
    pane.append(el('h3', '', t(plan.intent)));
    if (plan.status === 'error') { pane.append(el('p', 'wf-ai-warning', t(words[plan.error] ? plan.error : 'error')));if (plan.field) field(pane, plan.field.split('.').at(-1), getPath(command, plan.field), v => mutate(plan.field, v), ['amount', 'deposit', 'discount', 'quantity', 'unitPrice'].includes(plan.field.split('.').at(-1)) ? 'number' : 'text');editableDetails(null); }
    else if (plan.status === 'clarify') { pane.append(el('p', 'wf-ai-hint', t('clarify')));plan.questions.forEach(question);editableDetails(null); }
    else if (plan.status === 'read') showRead(plan.result);
    else if (plan.status === 'native') { pane.append(el('p', 'wf-ai-hint', t('nativeInfo')));pane.append(button(t(plan.native.page || plan.intent) + ' ↗', () => native(plan.native), 'primary')); }
    else {
      showRecord(plan.record);
      if (!plan.destructive) editableDetails(plan.record);
      const actions = el('div', 'wf-ai-actions');let deleteControl;
      if (plan.destructive) { pane.append(el('p', 'wf-ai-warning', t('deleteWarning')));deleteControl = field(pane, 'delete_record', '', () => {});deleteControl.autocomplete = 'off'; }
      const confirm = button(t(plan.destructive ? 'delete_record' : 'save'), () => save(deleteControl?.value), plan.destructive ? 'danger' : 'primary');confirm.disabled = busy || plan.destructive;
      if (deleteControl) deleteControl.addEventListener('input', () => { confirm.disabled = busy || deleteControl.value !== 'DELETE'; });actions.append(confirm);pane.append(actions);
    }
    if (plan.status === 'read' && plan.memoryUpdates.length) pane.append(button(t('remember'), async () => { let m = (await A.snapshot()).settings.assistantMemory || { version: 1, aliases: [] };plan.memoryUpdates.forEach(r => { m = C.remember(m, r.kind, r.alias, r.id); });await A.memory(m);message('assistant', t('memorySaved')); }));
    const actions = el('div', 'wf-ai-actions');const refresh = button(t('refresh'), compile), discard = button(t('cancel'), cancel);refresh.disabled = discard.disabled = busy;actions.append(refresh, discard);pane.append(actions);
  }
  async function runNativeByVoice(action, phraseKey = 'openingAction') {
    const turn = ++sequence, controller = new AbortController();nativeAbort?.abort();nativeAbort = controller;
    setBusy(true);try {
      const text = t(phraseKey);message('assistant', text, false, { speak: false });await speak(text);
      if (turn !== sequence || controller.signal.aborted) return;
      const keepVoice = voiceSession;await A.native(action, { signal: controller.signal });
      if (turn === sequence) close(keepVoice);
    } catch (error) { if (!controller.signal.aborted && turn === sequence) throw error; }
    finally { if (nativeAbort === controller) nativeAbort = null;if (turn === sequence) setBusy(false); }
  }
  async function answerQuestion(raw) {
    if (blocked || plan?.status === 'clarify') {
      const q = !blocked && plan?.questions?.[0];
      if (q?.type === 'number') { const number = V.numberAnswer(raw);if (number !== null) { await mutate(q.key, number);return true; } }
      const index = V.choose(raw, choiceEntries.map(r => r.label));
      if (index >= 0) { await choiceEntries[index].pick();return true; }
      if (/^(?:اختر|اختار|الخيار|choose|select|option|sec)\b/u.test(V.normalize(raw)) || /^\d+$/.test(V.normalize(raw))) { message('assistant', t('voiceChoiceMiss'));return true; }
    }
    return false;
  }
  async function changeLanguage(value, invoice = false) {
    if (invoice) { if (typeof window.setPrintLang === 'function') window.setPrintLang(value);message('assistant', t('invoiceLanguageChanged'));return; }
    pauseRecognition();stopSpeech();lang = value;if (typeof window.setLang === 'function') window.setLang(value);paintLabels();renderPlan();message('assistant', t('languageChanged'));
  }
  async function handleLocalCommand(raw) {
    const action = V.parseControl(raw);if (!action) return answerQuestion(raw);
    const type = action.type;
    if (type === 'mute' || type === 'unmute') { setSpeechMuted(type === 'mute');return true; }
    if (type === 'startListening') { startVoiceSession(true);return true; }
    if (type === 'stopListening') { stopVoiceSession(true);return true; }
    if (type === 'language') { await changeLanguage(action.value, action.invoice);return true; }
    if (type === 'theme') { if (S.theme !== action.value && typeof window.toggleTheme === 'function') window.toggleTheme();message('assistant', t(action.value === 'dark' ? 'darkModeOn' : 'lightModeOn'));return true; }
    if (type === 'page') { await runNativeByVoice({ action: 'open', page: action.value });return true; }
    if (type === 'openAssistant') { await open();return true; }
    if (type === 'closeAssistant') { close();return true; }
    if (type === 'new') { cancel();history = [];lastSavedInvoiceId = '';renderChat();setPanel('chat');message('assistant', t('ready'));return true; }
    if (type === 'cancel') { cancel();return true; }
    if (type === 'memory') { await showMemory();setPanel('review');message('assistant', t('memory'));return true; }
    if (type === 'tools') { toggleTools(true);return true; }
    if (type === 'help') { message('assistant', t('voiceHelp'));setPanel('chat');return true; }
    if (type === 'chat' || type === 'review') { if (type === 'review') renderPlan();setPanel(type);return true; }
    if (type === 'repeat') { const last = [...history].reverse().find(r => r.role === 'assistant');if (last) await speak(last.text);return true; }
    if (type === 'readReview') { announcePlan();return true; }
    if (type === 'refresh') { if (command) await compile();else message('assistant', t('nothingToRun'));return true; }
    if (type === 'delete' || type === 'save') {
      if (blocked) { announcePlan();return true; }
      if (plan && !dialog.open) { await open();message('assistant', t('draftContext'));return true; }
      if (plan?.destructive) { if (type === 'delete' && plan.status === 'ready') await save('DELETE');else message('assistant', t('deleteVoiceConfirm'));return true; }
      if (type === 'save' && plan?.status === 'ready') { await save();return true; }
      if (type === 'save' && plan?.status === 'native') { await runNativeByVoice(plan.native);return true; }
      message('assistant', t('nothingToSave'));return true;
    }
    if (['preview', 'export_pdf', 'export_excel', 'share_pdf', 'share_excel', 'print_invoice'].includes(type)) {
      // Current draft always wins over a previous invoice. Never export stale context.
      if (command && plan?.status !== 'native') { renderPlan();setPanel('review');message('assistant', t(type === 'preview' ? 'previewHere' : 'unsavedAction'));return true; }
      const id = plan?.status === 'native' && plan.native?.id ? plan.native.id : !plan ? lastSavedInvoiceId : '';
      if (id) await runNativeByVoice({ action: type === 'preview' ? 'preview_invoice' : type, id }, type === 'preview' ? 'openingPreview' : 'openingAction');
      else message('assistant', t('noRecentInvoice'));
      return true;
    }
    return false;
  }
  function catalog(snapshot, text) {
    const query = C.normalize(text), rank = rows => rows.slice().sort((a, b) => Number(query.includes(C.normalize(b.name || b.invNo))) - Number(query.includes(C.normalize(a.name || a.invNo))));
    return { clients: rank(snapshot.companies).slice(0, 150).map(r => ({ name: r.name, type: r.type })), products: rank(snapshot.products).slice(0, 200).map(r => ({ name: r.name, type: r.type })), invoices: rank(snapshot.invoices).slice(0, 100).map(r => ({ name: r.companyName, reference: r.invNo })), truncated: snapshot.companies.length > 150 || snapshot.products.length > 200 || snapshot.invoices.length > 100 };
  }
  async function send(text) {
    if (busy) return;
    text = (typeof text === 'string' ? text : input.value).trim();if (!text || text.length > 6000) return;
    pauseRecognition();stopSpeech();input.value = '';message('user', text);
    try { if (await handleLocalCommand(text)) { scheduleVoiceRestart();return; } } catch (e) { report(e);scheduleVoiceRestart();return; }
    if (!dialog.open) { dialog.showModal();paintLabels(); }
    const turn = ++sequence;setBusy(true, t('thinking'));stage = 'understanding';resetPane();pane.append(el('p', 'wf-ai-hint', t('thinking')));
    try {
      const snapshot = await A.snapshot();
      const memory = (snapshot.settings.assistantMemory?.aliases || []).slice(-100).map(r => { const store = { client: 'companies', product: 'products', invoice: 'invoices', payment: 'payments' }[r.kind];const row = snapshot[store]?.find(v => String(v.id) === String(r.id));return row ? { kind: r.kind, alias: r.alias, name: C.label(row, r.kind) } : null; }).filter(Boolean);
      const response = await B.plan({ message: text, locale: lang, today: snapshot.today, catalog: catalog(snapshot, text), memory, previousCommand: command, history: history.slice(0, -1).slice(-6) });
      if (turn !== sequence) return;
      command = response.command;blocked = response.needsClarification;backendChoices = response.choices || [];operationId = B.id();
      // A new interpretation may change query/target aliases. Never reuse a prior record ID.
      selections = {};
      await compile(false, turn);if (turn !== sequence) return;setBusy(false);renderPlan();message('assistant', response.reply + '\n' + describePlan());
    } catch (e) { if (turn !== sequence) return;input.value = text;stage = 'reviewing';renderPlan();report(e); }
    finally { if (turn === sequence) setBusy(false); }
  }
  function beginRecognition() {
    if (!voiceSession || busy || speechSpeaking || micEngine?.active || !dialog || document.hidden) return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { stopVoiceSession();message('assistant', t('voiceUnavailable'));return; }
    if (!micEngine) micEngine = V.createRecognition({ Recognition }, {
      started() { listening = true;paintVoiceControls(); },
      interim(text) { if (transcript) { transcript.textContent = text;transcript.hidden = !text; } },
      end(result) {
        listening = false;if (transcript) { transcript.textContent = '';transcript.hidden = true; }paintVoiceControls();
        if (!voiceSession) return;
        if (result.error && !['no-speech','aborted'].includes(result.error)) {
          voiceErrors++;
          if (['not-allowed','service-not-allowed','audio-capture','language-not-supported'].includes(result.error) || voiceErrors >= 3) { stopVoiceSession();message('assistant', t('voiceRetry'));return; }
        }
        if (result.text) { voiceErrors = 0;send(result.text).catch(report);return; }
        scheduleVoiceRestart(result.error ? 1500 : 650);
      }
    });
    micEngine.start(lang);
  }
  function startVoiceSession(announce = false) {
    if (!window.SpeechRecognition && !window.webkitSpeechRecognition) { message('assistant', t('voiceUnavailable'));return; }
    if (voiceSession) { scheduleVoiceRestart();return; }
    voiceSession = true;voiceErrors = 0;speechWarning = false;paintVoiceControls();
    if (announce) message('assistant', t('voiceStarted'));else scheduleVoiceRestart(100);
  }
  function stopVoiceSession(announce = false) {
    voiceSession = false;pauseRecognition();paintVoiceControls();if (announce) message('assistant', t('voiceStopped'));
  }
  function voice() { if (voiceSession) stopVoiceSession(true);else startVoiceSession(true); }
  async function showMemory() {
    if (busy) return;choiceEntries = [];setPanel('review');
    const snapshot = await A.snapshot(), memory = snapshot.settings.assistantMemory || { version: 1, aliases: [] };pane.replaceChildren(el('h3', '', t('memory')), el('p', 'wf-ai-hint', t('memoryInfo')), el('p', 'wf-ai-hint', memory.aliases.length + ' ' + t('learnedCount')));
    const actions = el('div', 'wf-ai-actions');
    actions.append(button(t('exportMemory'), () => { const url = URL.createObjectURL(new Blob([JSON.stringify(memory, null, 2)], { type: 'application/json' }));const link = el('a');link.href = url;link.download = 'WOW_Assistant_Memory.json';document.body.append(link);link.click();link.remove();setTimeout(() => URL.revokeObjectURL(url), 2000); }));
    const file = el('input');file.type = 'file';file.accept = '.json,application/json';file.hidden = true;
    file.addEventListener('change', async () => { try { const selected = file.files[0];if (!selected) return;if (selected.size > 300000) throw new Error('memory_invalid');let data;try { data = C.validateMemory(JSON.parse(await selected.text())); } catch (_) { throw new Error('memory_invalid'); }if (!window.confirm(t('importConfirm'))) return;await A.memory(data);await showMemory(); } catch (e) { report(e); }finally { file.value = ''; } });
    actions.append(button(t('importMemory'), () => file.click()), button(t('clearMemory'), async () => { if (!window.confirm(t('clearConfirm'))) return;await A.memory({ version: 1, aliases: [] });await showMemory(); }, 'danger'));pane.append(actions, file);
    memory.aliases.slice().reverse().forEach(r => { const row = el('div', 'wf-ai-memory-row'), store = { client: 'companies', product: 'products', invoice: 'invoices', payment: 'payments' }[r.kind], target = snapshot[store]?.find(v => String(v.id) === String(r.id));row.append(el('span', '', r.alias + ' → ' + (target ? C.label(target, r.kind) : t('record_missing'))), button('×', async () => { const latest = (await A.snapshot()).settings.assistantMemory || { version: 1, aliases: [] };latest.aliases = latest.aliases.filter(x => !(x.kind === r.kind && C.normalize(x.alias) === C.normalize(r.alias)));await A.memory(latest);await showMemory(); }, 'danger'));pane.append(row); });
    pane.append(el('h3', '', t('history')));(snapshot.settings.assistantOperations || []).slice(-10).reverse().forEach(r => pane.append(el('p', 'wf-ai-hint', t(r.intent) + ' · ' + new Date(r.at).toLocaleString(lang))));if (command) pane.append(button(t('draft'), () => {renderPlan();setPanel('review');}));
  }
  function close(keepVoice = false) {
    if (busy && stage === 'saving') return;
    if (!keepVoice) { sequence++;nativeAbort?.abort();voiceSession = false;pauseRecognition();stopSpeech();stage = plan ? 'reviewing' : '';setBusy(false); }
    if (dialog.open) dialog.close();paintVoiceControls();
    if (keepVoice) scheduleVoiceRestart(260);
    lastFocus?.focus();
  }
  async function open() {
    if (!window.WOW_ASSISTANT_APP_READY) return;
    lang = ['ar', 'tr', 'en'].includes(S.lang) ? S.lang : 'ar';lastFocus = document.activeElement;paintLabels();if (!dialog.open) dialog.showModal();dialog.style.height = window.visualViewport ? window.visualViewport.height + 'px' : '';
    if (command) await compile(false);else renderPlan();if (!window.matchMedia?.('(pointer: coarse)').matches) input.focus();paintVoiceControls();
    if (!greeted && !speechMuted) { greeted = true;await speak(t('welcome') + ' ' + t('voiceHint')); }
  }
  function paintLabels() {
    dialog.dir = lang === 'ar' ? 'rtl' : 'ltr';dialog.lang = lang;
    dialog.querySelectorAll('[data-ai-text]').forEach(n => { n.textContent = t(n.dataset.aiText); });input.placeholder = t('placeholder');input.setAttribute('aria-label', t('placeholder'));micBtn.setAttribute('aria-label', t(listening ? 'stop' : 'mic'));dialog.querySelector('#wf-ai-language').value = lang;
    taskMenu.replaceChildren(el('option', '', t('chooseTask')));taskMenu.options[0].value = '';C.intents.forEach(k => { const o = el('option', '', t(k));o.value = k;taskMenu.append(o); });
    taskMenu.setAttribute('aria-label', t('chooseTask'));pagesMenu.setAttribute('aria-label', t('choosePage'));dialog.querySelector('#wf-ai-close').setAttribute('aria-label', t('close'));
    pagesMenu.replaceChildren(el('option', '', t('choosePage')));pagesMenu.options[0].value = '';C.pages.forEach(k => { const o = el('option', '', t(k));o.value = k;pagesMenu.append(o); });
    renderChat();paintVoiceControls();setPanel(selectedPanel);launcher.setAttribute('aria-label', t('title'));
  }
  function init() {
    launcher = button('✦ WOW AI', open);launcher.id = 'wf-ai-launch';launcher.setAttribute('aria-haspopup', 'dialog');document.body.append(launcher);
    dialog = el('dialog');dialog.id = 'wf-ai-dialog';dialog.setAttribute('aria-labelledby', 'wf-ai-title');
    const head = el('header', 'wf-ai-head'), heading = el('div', 'wf-ai-heading'), title = el('h2');title.id = 'wf-ai-title';title.dataset.aiText = 'title';const subtitle = el('p');subtitle.dataset.aiText = 'subtitle';heading.append(title, subtitle);const closeBtn = button('×', close, 'icon');closeBtn.setAttribute('aria-label', t('close'));closeBtn.id = 'wf-ai-close';toolsBtn = button('', () => toggleTools());toolsBtn.dataset.aiText = 'tools';toolsBtn.setAttribute('aria-controls', 'wf-ai-tools');toolsBtn.setAttribute('aria-expanded', 'false');head.append(el('div', 'wf-ai-mark', '✦'), heading, toolsBtn, closeBtn);
    toolbar = el('div', 'wf-ai-toolbar');toolbar.id = 'wf-ai-tools';toolbar.hidden = true;const language = el('select');language.id = 'wf-ai-language';language.setAttribute('aria-label', 'Language');[['ar', 'العربية'], ['tr', 'Türkçe'], ['en', 'English']].forEach(([v, text]) => { const option = el('option', '', text);option.value = v;language.append(option); });language.addEventListener('change', () => changeLanguage(language.value).catch(report));
    connectBtn = button('', () => {});connectBtn.dataset.aiText = 'connect';
    // Google popup must begin synchronously in its own click event, not after an await.
    connectBtn.addEventListener('click', () => { if (busy) return;const connection = B.connect();setBusy(true);connection.then(() => message('assistant', t('connected'))).catch(report).finally(() => setBusy(false)); });
    speakerBtn = button('', () => setSpeechMuted(!speechMuted));speakerBtn.classList.add('speaker');speakerBtn.setAttribute('aria-pressed', speechMuted ? 'false' : 'true');
    const memoryBtn = button('', showMemory);memoryBtn.dataset.aiText = 'memory';const newBtn = button('', () => { if (busy) return;if (command && !window.confirm(t('newConfirm'))) return;cancel();history = [];renderChat(); });newBtn.dataset.aiText = 'new';
    taskMenu = el('select');taskMenu.setAttribute('aria-label', t('chooseTask'));taskMenu.addEventListener('change', () => { const v = taskMenu.value;taskMenu.value = '';if (v) start({ intent: v }).catch(report); });
    pagesMenu = el('select');pagesMenu.setAttribute('aria-label', t('choosePage'));pagesMenu.addEventListener('change', () => { const v = pagesMenu.value;pagesMenu.value = '';if (v) start({ intent: 'open_page', page: v }).catch(report); });
    voiceBadge = el('div', 'wf-ai-voice-state');voiceBadge.setAttribute('aria-hidden', 'true');status = el('div', 'wf-ai-status');status.setAttribute('role', 'status');status.setAttribute('aria-live', 'polite');toolbar.append(language, connectBtn, memoryBtn, newBtn, taskMenu, pagesMenu, voiceBadge, status);
    const switcher = el('div', 'wf-ai-switcher');panelTabs = el('div', 'wf-ai-tabs');panelTabs.setAttribute('role', 'tablist');
    [['chat','chat'],['review','draft']].forEach(([value,key]) => { const node = button('', () => setPanel(value));node.dataset.panel = value;node.dataset.aiText = key;node.setAttribute('role','tab');node.id = 'wf-ai-tab-' + value;node.setAttribute('aria-controls','wf-ai-panel-' + value);panelTabs.append(node); });switcher.append(panelTabs,speakerBtn);
    const layout = el('div', 'wf-ai-layout');chat = el('section', 'wf-ai-chat');chat.id = 'wf-ai-panel-chat';chat.setAttribute('role', 'log');chat.setAttribute('aria-live', 'polite');pane = el('aside', 'wf-ai-preview');pane.id = 'wf-ai-panel-review';pane.setAttribute('aria-label', t('draft'));layout.append(chat, pane);
    const compose = el('form', 'wf-ai-compose'), entry = el('div', 'wf-ai-entry');input = el('textarea');input.rows = 1;input.maxLength = 6000;micBtn = button('🎙', voice, 'icon voice');micBtn.setAttribute('aria-pressed', 'false');sendBtn = button('', () => send(), 'primary');sendBtn.dataset.aiText = 'send';entry.append(micBtn, input, sendBtn);const voiceStrip = el('div', 'wf-ai-voice-strip'), wave = el('span', 'wf-ai-wave');wave.setAttribute('aria-hidden','true');for (let i=0;i<5;i++) wave.append(el('i'));
    voiceStateLabel = el('span');transcript = el('p','wf-ai-transcript');transcript.hidden = true;voiceStrip.append(wave,voiceStateLabel);const voiceHint = el('p', 'wf-ai-voice-hint');voiceHint.dataset.aiText = 'voiceHint';const privacy = el('p', 'wf-ai-hint');privacy.dataset.aiText = 'privacy';compose.append(voiceStrip, transcript, entry, voiceHint);toolbar.append(privacy);compose.addEventListener('submit', e => { e.preventDefault();send(); });input.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault();send(); } });
    dialog.append(head, toolbar, switcher, layout, compose);document.body.append(dialog);dialog.addEventListener('cancel', e => { e.preventDefault();close(); });
    paintLabels();renderPlan();setPanel('chat');
    fetch(new URL('assistant-knowledge.json', window.location.href).href).then(r => r.ok ? r.json() : null).then(v => { if (v?.version === 1 && v.examples) { knowledge = v;renderChat(); } }).catch(() => {});
    try { const draft = JSON.parse(sessionStorage.getItem('wf_ai_draft_v1') || 'null');if (draft?.command && C.intents.includes(draft.command.intent)) { command = draft.command;selections = draft.selections || {};operationId = draft.operationId || B.id();blocked = !!draft.blocked;message('assistant', t('draftRestored'), false, { speak: false }); } } catch (_) {}
    if (window.visualViewport) { const fit = () => { if (dialog.open) dialog.style.height = window.visualViewport.height + 'px'; };window.visualViewport.addEventListener('resize', fit);dialog.addEventListener('focusin', fit); }
    window.WOWAssistant = { open, close, speak, setSpeechMuted, startVoiceSession, stopVoiceSession };document.addEventListener('visibilitychange', () => { if (document.hidden) { pauseRecognition();stopSpeech(); } else scheduleVoiceRestart(500); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });else init();
})();
