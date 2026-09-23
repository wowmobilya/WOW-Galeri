/* WOW voice controls. No database or network access; business writes stay in the adapter. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WOWAssistantVoice = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const locales = { ar: 'ar-SA', tr: 'tr-TR', en: 'en-US' };
  function normalize(text) {
    return String(text || '').normalize('NFKD').replace(/[\u0300-\u036f\u064b-\u065f\u0670\u0640]/g, '').toLowerCase().replace(/ı/g, 'i')
      .replace(/[٠-٩۰-۹]/g, d => String('٠١٢٣٤٥٦٧٨٩'.includes(d) ? '٠١٢٣٤٥٦٧٨٩'.indexOf(d) : '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  }
  function polite(text) {
    return normalize(text).replace(/^(?:لو سمحت|من فضلك|ممكن|please|could you|can you|lutfen)\s+/, '')
      .replace(/\s+(?:لو سمحت|من فضلك|please|lutfen)$/, '').trim();
  }
  const grammar = {
    unmute: /^(شغل الصوت|افتح الصوت|رجع الصوت|تكلم بصوت|احكي بصوت|sesi ac|sesli konus|sesli cevap ver|unmute|turn (?:the )?(?:voice|sound) on|speak aloud|voice on)$/,
    mute: /^(اوقف الصوت|وقف الصوت|اطفي الصوت|اطفئ الصوت|طفي الصوت|سكر الصوت|اكتم الصوت|بدون صوت|خليك صامت|خليك ساكت|sessiz|sesi kapat|sesli cevap verme|mute|stop speaking|stop voice|be silent|turn (?:the )?(?:voice|sound) off)$/,
    stopListening: /^(اوقف الاستماع|وقف الاستماع|اغلق الميكروفون|سكر المايك|سكر الميكروفون|dinlemeyi durdur|mikrofonu kapat|stop listening|turn off (?:the )?microphone)$/,
    startListening: /^(ابدا الاستماع|شغل الميكروفون|افتح الميكروفون|dinlemeye basla|mikrofonu ac|start listening|turn on (?:the )?microphone)$/,
    save: /^(احفظ(?: الفاتوره| الفاتورة)?|اكد واحفظ|تاكيد وحفظ|تمام احفظ|نفذ(?: الان)?|kaydet|faturayi kaydet|onayla(?: ve kaydet)?|calistir|run|execute|save(?: (?:the )?invoice)?|confirm and save)$/,
    delete: /^(تاكيد الحذف النهايي|silme islemini onayliyorum|confirm final delete)$/,
    cancel: /^(الغاء|الغي|الغ المسودة|الغي المسودة|iptal|taslagi iptal et|cancel(?: draft)?)$/,
    preview: /^(معاينة|معاينه|عاين|اعرض المعاينة|اعرض الفاتورة|ورجيني الفاتورة|وريني الفاتورة|افتح المعاينة|onizle|faturayi goster|preview|show preview|show invoice)$/,
    refresh: /^(حدث المعاينة|تحديث المعاينة|onizlemeyi yenile|refresh preview)$/,
    repeat: /^(كرر كلامك|عيد كلامك|اعد الكلام|كرر الرد|tekrar soyle|repeat|say that again)$/,
    readReview: /^(اقرا التفاصيل|اقرا الفاتورة|اقرا المعاينة|لخص الفاتورة|ozeti oku|faturayi oku|read (?:the )?(?:details|invoice|preview)|read it aloud)$/,
    chat: /^(اعرض المحادثة|افتح المحادثة|sohbeti goster|show chat|open chat)$/,
    review: /^(اعرض التفاصيل|افتح التفاصيل|اعرض المسودة|ayrintilari goster|show details|show draft)$/,
    openAssistant: /^(افتح المساعد|اظهر المساعد|رجع المساعد|ارجع للمساعد|asistani ac|show assistant|open assistant|open ai)$/,
    closeAssistant: /^(اغلق المساعد|سكر المساعد|اخرج من المساعد|asistani kapat|close assistant|close ai)$/,
    new: /^(محادثة جديدة|طلب جديد|ابدا من جديد|yeni sohbet|new chat|new conversation)$/,
    memory: /^(افتح الذاكرة|اعرض الذاكرة|hafizayi ac|open memory|show memory)$/,
    tools: /^(افتح الادوات|اعرض الادوات|araclari ac|show tools|open tools)$/,
    help: /^(مساعدة|ساعدني|شو بتعمل|شو بتقدر تعمل|وش تقدر تسوي|ماذا تستطيع ان تفعل|yardim|help|what can you do)$/,
    export_pdf: /^(?:نزل|حمل|تنزيل|تحميل) (?:pdf|بي دي اف)$|^(?:download pdf|pdf indir|pdf indirir misin)$/,
    export_excel: /^(?:نزل|حمل|تنزيل|تحميل) (?:excel|اكسل)$|^(?:download excel|excel indir|excel indirir misin)$/,
    share_pdf: /^(?:شارك|مشاركة) (?:pdf|بي دي اف)$|^(?:share pdf|pdf paylas)$/,
    share_excel: /^(?:شارك|مشاركة) (?:excel|اكسل)$|^(?:share excel|excel paylas)$/,
    print_invoice: /^(اطبع|اطبع الفاتورة|طباعة الفاتورة|print|print invoice|faturayi yazdir)$/
  };
  const routes = [
    ['print-settings', /^(اعدادات الطباعة|print settings|yazdirma ayarlari)$/], ['dashboard', /^(لوحة التحكم|الرئيسية|dashboard|ana sayfa)$/],
    ['companies', /^(العملاء|الزبائن|customers|clients|musteriler)$/], ['products', /^(المنتجات|الموديلات|products|models|urunler)$/],
    ['invoices', /^(الفواتير|invoices|faturalar)$/], ['payments', /^(الدفعات|payments|odemeler)$/],
    ['settings', /^(الاعدادات|settings|ayarlar)$/], ['backup', /^(النسخ الاحتياطي|backup|yedek|yedekleme)$/],
    ['restore', /^(الاستعادة|restore|geri yukleme)$/], ['barcode', /^(الباركود|barcode|barkod)$/],
    ['currency', /^(العملة|اسعار الصرف|currency|doviz)$/], ['add-company', /^(اضافة عميل|add customer|musteri ekle)$/],
    ['add-product', /^(اضافة منتج|add product|urun ekle)$/], ['create-invoice', /^(انشاء فاتورة|create invoice|fatura olustur)$/]
  ];
  function parseControl(text) {
    const n = polite(text);if (!n) return null;
    for (const [type, re] of Object.entries(grammar)) if (re.test(n)) return { type };
    const languageNames = '(?:ب|لل|ل)?(?:ال)?(?:عربي|عربية|انجليزي|انجليزية|تركي|تركية)|arabic|english|turkish|arapca|ingilizce|turkce';
    const languageRE = new RegExp('^(?:(?:غير|بدل|حول|خلي|اجعل)(?: (?:ال)?لغة)?(?: البرنامج| المساعد| الفاتورة)?(?: الى)? |(?:احكي|تكلم|تحدث)(?: معي)? |(?:change|switch|set)(?: the)?(?: invoice)?(?: language)?(?: to)? |(?:dili|fatura dilini) )(' + languageNames + ')(?: yap| degistir)?$');
    const match = n.match(languageRE);
    if (match) {
      const name = match[1], value = /انجليز|english|ingilizce/.test(name) ? 'en' : /ترك|turk/.test(name) ? 'tr' : 'ar';
      return { type: 'language', value, invoice: /الفاتورة|invoice|fatura/.test(n) };
    }
    if (/^(?:(?:شغل|فعل|حول الى|افتح) )?(?:الوضع الليلي|الوضع الداكن|ثيم داكن)$|^(?:enable |turn on |switch to )?dark mode$|^(?:koyu|karanlik) mod(?:u ac)?$/.test(n)) return { type: 'theme', value: 'dark' };
    if (/^(?:(?:شغل|فعل|حول الى|افتح) )?(?:الوضع النهاري|الوضع الفاتح|ثيم فاتح)$|^(?:enable |turn on |switch to )?light mode$|^acik mod(?:u ac)?$/.test(n)) return { type: 'theme', value: 'light' };
    const target = n.replace(/^(?:افتح|روح على|روح|اذهب الى|انتقل الى|go to|open)\s+/, '').replace(/\s+(?:ac|git)$/, '');
    if (target !== n) { const page = routes.find(([,re]) => re.test(target));if (page) return { type: 'page', value: page[0] }; }
    return null;
  }
  function choose(text, labels) {
    const n = polite(text).replace(/^(?:اختر|اختار|اختارلي|choose|select|sec)\s+/, '');
    const raw = n.replace(/^(?:الخيار|خيار|رقم|option|number|secenek)\s+/, '').replace(/\s+(?:خيار|secenek|option)$/, '');
    const ordinals = [['الاول','اول','one','first','birinci','ilk'],['الثاني','ثاني','two','second','ikinci'],['الثالث','ثالث','three','third','ucuncu'],['الرابع','رابع','four','fourth','dorduncu'],['الخامس','خامس','five','fifth','besinci'],['السادس','سادس','six','sixth','altinci'],['السابع','سابع','seven','seventh','yedinci'],['الثامن','ثامن','eight','eighth','sekizinci'],['التاسع','تاسع','nine','ninth','dokuzuncu'],['العاشر','عاشر','ten','tenth','onuncu']];
    let index = /^\d+$/.test(raw) ? Number(raw) - 1 : ordinals.findIndex(words => words.includes(raw));
    if (index >= 0) return index < labels.length ? index : -1;
    const matches = labels.map((label,i) => normalize(label) === n ? i : -1).filter(i => i >= 0);
    return matches.length === 1 ? matches[0] : -1;
  }
  function numberAnswer(text) {
    const n = String(text || '').trim().replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/٫/g, '.');
    return /^\d+(?:\.\d+)?$/.test(n) && Number.isFinite(Number(n)) ? Number(n) : null;
  }
  function createSpeech(env, callbacks = {}) {
    let active = null;
    const later = env.setTimeout || setTimeout, clear = env.clearTimeout || clearTimeout;
    function finish(job, ok, error) {
      if (active !== job) return;
      active = null;clear(job.timer);callbacks.change?.(false);job.resolve(ok);
      if (error) callbacks.error?.(error);
    }
    function cancel() {
      const job = active;if (job) finish(job, false);
      env.synthesis?.cancel();
    }
    function speak(text, lang) {
      cancel();
      return new Promise(resolve => {
        if (!text || !env.synthesis || !env.Utterance) { resolve(false);callbacks.error?.('unavailable');return; }
        const parts = String(text).slice(0, 2400).match(/.{1,160}(?:\s|$)|\S{1,160}/gu) || [String(text).slice(0, 160)];
        const job = { resolve, timer: null, index: 0 };active = job;callbacks.change?.(true);
        function next() {
          if (active !== job) return;
          const u = new env.Utterance(parts[job.index]);u.lang = locales[lang] || locales.en;
          const voices = env.synthesis.getVoices?.() || [];const voice = voices.find(v => v.lang?.toLowerCase().startsWith(lang));if (voice) u.voice = voice;
          u.rate = lang === 'ar' ? .96 : 1;u.pitch = 1;let ended = false;
          u.onend = () => { if (ended || active !== job) return;ended = true;clear(job.timer);if (++job.index < parts.length) next();else finish(job, true); };
          u.onerror = e => { if (ended || active !== job) return;ended = true;finish(job, false, e?.error || 'speech-failed'); };
          job.timer = later(() => { finish(job, false, 'timeout');env.synthesis.cancel(); }, Math.max(8000, parts[job.index].length * 180));
          try { env.synthesis.speak(u); } catch (_) { finish(job, false, 'speech-failed'); }
        }
        next();
      });
    }
    return { speak, cancel, get busy() { return !!active; } };
  }
  function createRecognition(env, callbacks = {}) {
    let active = null;
    function abort() { const job = active;active = null;if (job) { try { job.mic.abort(); } catch (_) {} } }
    function start(lang) {
      if (active || !env.Recognition) return false;
      const mic = new env.Recognition(), job = { mic, text: '', error: '', ended: false };active = job;
      mic.lang = locales[lang] || locales.en;mic.interimResults = true;mic.continuous = false;mic.maxAlternatives = 1;
      mic.onstart = () => { if (active === job) callbacks.started?.(); };
      mic.onresult = e => {
        if (active !== job) return;
        const final = [], interim = [];
        for (let i = 0; i < e.results.length; i++) (e.results[i].isFinal ? final : interim).push(e.results[i][0]?.transcript || '');
        job.text = final.join(' ').replace(/\s+/g, ' ').trim();callbacks.interim?.([job.text, ...interim].join(' ').trim());
      };
      const end = () => {
        if (active !== job || job.ended) return;job.ended = true;active = null;
        callbacks.end?.({ text: job.error ? '' : job.text, error: job.error });
      };
      mic.onerror = e => { if (active !== job) return;job.error = e?.error || 'unknown';end();try { mic.abort(); } catch (_) {} };
      mic.onend = end;
      try { mic.start();return true; } catch (_) { job.error = 'start-failed';end();return false; }
    }
    return { start, abort, get active() { return !!active; } };
  }
  return { normalize, parseControl, choose, numberAnswer, createSpeech, createRecognition };
});
