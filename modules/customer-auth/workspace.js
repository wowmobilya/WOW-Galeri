/* Load early: email proof fragments are removed from the address before the
 * authenticated app boots. Proofs stay in this closure, never device storage. */
(function(root,factory){'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.WFCustomerAuth=api;})(typeof window==='object'?window:globalThis,function(root){
 'use strict';
 const languages=['ar','en','tr','fr','ru'];
 const words={
  register:['إنشاء حساب زبون','Create customer account','Müşteri hesabı aç','Créer un compte client','Создать аккаунт покупателя'],
  recover:['نسيت كلمة المرور','Forgot password','Parolamı unuttum','Mot de passe oublié','Забыли пароль'],
  back:['العودة للدخول','Back to sign in','Girişe dön','Retour à la connexion','Вернуться ко входу'],
  name:['الاسم','Name','Ad','Nom','Имя'],username:['اسم الدخول','Username','Kullanıcı adı','Identifiant','Имя пользователя'],
  company:['الشركة','Company','Şirket','Entreprise','Компания'],email:['البريد الإلكتروني','Email','E-posta','Adresse e-mail','Электронная почта'],
  country:['الدولة','Country','Ülke','Pays','Страна'],search:['ابحث عن دولة','Find a country','Ülke ara','Rechercher un pays','Поиск страны'],
  callingCode:['رمز الاتصال الدولي','Calling code','Telefon ülke kodu','Indicatif téléphonique','Телефонный код'],phone:['رقم الهاتف دون رمز الدولة','Phone without country code','Ülke kodu olmadan telefon','Téléphone sans indicatif','Телефон без кода страны'],
  send:['طلب رابط البريد','Request email link','E-posta bağlantısı iste','Demander le lien','Запросить ссылку'],
  sending:['جارٍ معالجة الطلب…','Processing request…','İstek işleniyor…','Traitement de la demande…','Обработка запроса…'],
  sent:['قُبل الطلب. إذا كان البريد مؤهلًا، تحقق من صندوق الوارد والرسائل غير المرغوبة. قبول الطلب لا يؤكد وصول الرسالة.','Request accepted. If the address is eligible, check your inbox and spam folder. Acceptance does not confirm email delivery.','İstek alındı. Adres uygunsa gelen kutunuzu ve spam klasörünü kontrol edin. İsteğin alınması e-postanın teslim edildiğini doğrulamaz.','Demande acceptée. Si l’adresse est admissible, vérifiez la réception et les indésirables. L’acceptation ne confirme pas la livraison du courriel.','Запрос принят. Если адрес подходит, проверьте входящие и спам. Принятие запроса не подтверждает доставку письма.'],
  intro:['أكّد ملكيتك للبريد أولًا، ثم اختر كلمة مرور من رابط التأكيد. الحساب مخصص لمشترياتك ومحادثتك مع المالك وملفاتك.','Verify your email first, then choose a password using the confirmation link. Your account covers your purchases, owner conversation and files.','Önce e-postanızı doğrulayın, ardından bağlantıdan parola belirleyin. Hesap satın alımlarınıza, işletme sahibiyle sohbetinize ve dosyalarınıza özeldir.','Vérifiez d’abord votre adresse, puis choisissez un mot de passe depuis le lien. Le compte donne accès à vos achats, votre conversation avec le propriétaire et vos fichiers.','Сначала подтвердите почту, затем задайте пароль по ссылке. Аккаунт предназначен для ваших покупок, общения с владельцем и файлов.'],
  recoveryIntro:['أدخل البريد الذي أكّدته عند إنشاء حساب الزبون.','Enter the email verified when you registered your customer account.','Müşteri hesabınızı açarken doğruladığınız e-postayı girin.','Saisissez l’adresse vérifiée à la création du compte client.','Введите адрес, подтверждённый при регистрации аккаунта покупателя.'],
  password:['كلمة مرور جديدة، 12 محرفًا على الأقل','New password, at least 12 characters','Yeni parola, en az 12 karakter','Nouveau mot de passe, 12 caractères minimum','Новый пароль, не менее 12 символов'],
  repeat:['أعد كتابة كلمة المرور','Repeat password','Parolayı tekrar girin','Répéter le mot de passe','Повторите пароль'],
  finish:['تأكيد البريد وحفظ كلمة المرور','Confirm email and save password','E-postayı doğrula ve parolayı kaydet','Confirmer et enregistrer le mot de passe','Подтвердить почту и сохранить пароль'],
  finishRecovery:['حفظ كلمة المرور الجديدة','Save new password','Yeni parolayı kaydet','Enregistrer le nouveau mot de passe','Сохранить новый пароль'],
  mismatch:['يجب أن تتطابق كلمتا المرور وأن تتكونا من 12 إلى 128 محرفًا.','Passwords must match and contain 12 to 128 characters.','Parolalar aynı olmalı ve 12–128 karakter içermelidir.','Les mots de passe doivent être identiques et compter 12 à 128 caractères.','Пароли должны совпадать и содержать от 12 до 128 символов.'],
  complete:['اكتمل التحقق وحُفظت كلمة المرور. سجّل الدخول باسمك وكلمة مرورك الجديدة.','Verification completed and password saved. Sign in with your username and new password.','Doğrulama tamamlandı ve parola kaydedildi. Kullanıcı adınız ve yeni parolanızla giriş yapın.','Vérification terminée et mot de passe enregistré. Connectez-vous avec votre identifiant et votre nouveau mot de passe.','Проверка завершена, пароль сохранён. Войдите с именем пользователя и новым паролем.'],
  invalid:['الرابط غير متاح أو انتهى أو استُخدم. اطلب رابطًا جديدًا واستعمل أحدث رسالة.','This link is unavailable, expired or already used. Request a new link and use the latest email.','Bağlantı kullanılamıyor, süresi doldu veya kullanıldı. Yeni bağlantı isteyin ve en son e-postayı kullanın.','Le lien est indisponible, expiré ou déjà utilisé. Demandez-en un nouveau et ouvrez le dernier courriel.','Ссылка недоступна, истекла или уже использована. Запросите новую и используйте последнее письмо.'],
  error:['تعذّر تأكيد العملية. تحقق من اتصالك وأعد المحاولة. إذا كنت تحفظ كلمة مرور، جرّب الدخول بها أو اطلب رابطًا جديدًا.','The operation could not be confirmed. Check your connection and retry. If saving a password, try signing in with it or request a new link.','İşlem doğrulanamadı. Bağlantınızı kontrol edin. Parola kaydediyorsanız bu parolayla giriş yapın veya yeni bağlantı isteyin.','L’opération n’a pas pu être confirmée. Vérifiez la connexion. Si vous enregistriez un mot de passe, essayez de vous connecter ou demandez un nouveau lien.','Операция не подтверждена. Проверьте соединение. При сохранении пароля попробуйте войти с ним или запросите новую ссылку.'],
  conflict:['تعذّر إنشاء الحساب بهذه البيانات. اختر اسم دخول آخر واطلب رابطًا جديدًا.','The account could not be created with these details. Choose another username and request a new link.','Bu bilgilerle hesap oluşturulamadı. Başka kullanıcı adı seçip yeni bağlantı isteyin.','Le compte n’a pas pu être créé. Choisissez un autre identifiant et demandez un nouveau lien.','Не удалось создать аккаунт. Выберите другое имя пользователя и запросите новую ссылку.'],
  limited:['طلبات كثيرة؛ انتظر قبل المحاولة مجددًا.','Too many requests; wait before trying again.','Çok fazla istek; yeniden denemeden önce bekleyin.','Trop de demandes ; patientez avant de réessayer.','Слишком много запросов. Подождите перед повторной попыткой.'],
  unavailable:['خدمة بريد حسابات الزبائن غير مفعّلة بعد.','Customer account email is not enabled yet.','Müşteri hesabı e-posta hizmeti henüz etkin değil.','Le service e-mail des comptes clients n’est pas encore actif.','Почтовая служба аккаунтов покупателей ещё не включена.'],
  control:['تسجيل الزبائن وبريد الحسابات','Customer registration and account email','Müşteri kaydı ve hesap e-postaları','Inscription et courriels des clients','Регистрация и почта покупателей'],
  signupEnabled:['السماح بتسجيل زبون جديد بعد تأكيد بريده','Allow new customers after email verification','E-posta doğrulamasından sonra yeni müşteri kaydı','Autoriser les clients après vérification du courriel','Разрешить регистрацию после подтверждения почты'],
  recoveryEnabled:['السماح باسترجاع كلمة مرور الزبون عبر بريده المؤكّد','Allow customer recovery through verified email','Doğrulanmış e-postayla müşteri parolası kurtarma','Autoriser la récupération par courriel vérifié','Разрешить восстановление через подтверждённую почту'],
  save:['حفظ الإعدادات','Save settings','Ayarları kaydet','Enregistrer','Сохранить настройки'],
  saved:['حُفظت الإعدادات.','Settings saved.','Ayarlar kaydedildi.','Paramètres enregistrés.','Настройки сохранены.'],
  link:['رابط دخول الزبائن','Customer access link','Müşteri giriş bağlantısı','Lien d’accès client','Ссылка для покупателей'],
  accepted:['طلبات قبلها مزوّد البريد خلال 24 ساعة','Requests accepted by email provider in 24 hours','24 saatte e-posta sağlayıcısının kabul ettiği istekler','Demandes acceptées par le fournisseur en 24 h','Принято почтовым провайдером за 24 часа'],
  failed:['طلبات بريد تعذّرت خلال 24 ساعة','Failed email requests in 24 hours','24 saatte başarısız e-posta istekleri','Demandes de courriel échouées en 24 h','Ошибки почтовых запросов за 24 часа'],
  finished:['عمليات تحقق مكتملة خلال 24 ساعة','Completed verifications in 24 hours','24 saatte tamamlanan doğrulamalar','Vérifications achevées en 24 h','Завершено проверок за 24 часа'],
  deliveryNote:['قبول مزوّد البريد لا يثبت وصول الرسالة. تحقّق من صندوق اختبار قبل فتح التسجيل للزبائن.','Provider acceptance does not prove delivery. Verify a test mailbox before opening registration to customers.','Sağlayıcının kabulü teslimatı kanıtlamaz. Kaydı açmadan önce test posta kutusunda doğrulayın.','L’acceptation ne prouve pas la livraison. Vérifiez une boîte de test avant d’ouvrir les inscriptions.','Принятие провайдером не доказывает доставку. Проверьте тестовый ящик перед открытием регистрации.']
 };
 const countryCodes='AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
 const text=(key,lang)=>words[key][Math.max(0,languages.indexOf(lang))];
 const langOf=value=>languages.includes(value)?value:'ar';
 function captureProof(location=root.location,history=root.history){
  if(!location?.href)return null;
  try{
   const url=new URL(location.href),kind=url.searchParams.get('wf-customer'),fragment=new URLSearchParams(url.hash.slice(1));
   const tokenHash=fragment.get('token_hash')||url.searchParams.get('token_hash'),challenge=fragment.get('challenge');
   if(!['register','recover'].includes(kind)&&!tokenHash&&!challenge&&!url.searchParams.has('challenge'))return null;
   const requestId=url.searchParams.get('request'),workspaceId=url.searchParams.get('workspace');
   // Clear proof-bearing address components even if malformed. URL fragments
   // are preferred in templates so they never reach a static hosting request.
   for(const key of ['token_hash','challenge','type','wf-customer','request','access_token','refresh_token'])url.searchParams.delete(key);
   url.hash='dashboard';history?.replaceState?.(null,'',url.href);
   if(!['register','recover'].includes(kind)||!tokenHash||!/^[A-Za-z0-9_-]{32,512}$/.test(tokenHash)||!challenge||!/^[A-Za-z0-9_-]{43}$/.test(challenge))return {invalid:true};
   return {kind,requestId,workspaceId,tokenHash,challenge};
  }catch(_){return {invalid:true};}
 }
 let incoming=captureProof();
 function mountVisitor({container,client,lang='ar',loginForm,onComplete=()=>{}}){
  if(!container||!client?.isRemote?.())return {updateLanguage(){},dispose(){}};
  const doc=container.ownerDocument||root.document,area=doc.createElement('section');area.className='wf-customer-auth';container.append(area);
  let locale=langOf(lang),disposed=false,busy=false,options={},mode='',message='',proof=incoming;incoming=null;
  let draft={name:'',username:'',company:'',email:'',country:'TR',callingCode:'+90',phone:''};
  const t=key=>text(key,locale),el=(tag,caption)=>{const n=doc.createElement(tag);if(caption!==undefined)n.textContent=caption;return n;};
  const button=(key,handler)=>{const n=el('button',t(key));n.type='button';n.className='btn';n.disabled=busy;n.addEventListener('click',handler);return n;};
  const note=()=>{const n=el('p',message);n.setAttribute('role','status');n.setAttribute('aria-live','polite');return n;};
  const errorMessage=error=>t(error?.code==='RATE_LIMITED'?'limited':error?.code==='CUSTOMER_AUTH_UNAVAILABLE'?'unavailable':error?.code==='CUSTOMER_REGISTRATION_CONFLICT'?'conflict':error?.code==='INVALID_EMAIL_LINK'?'invalid':'error');
  function render(){
   if(disposed)return;area.replaceChildren();area.dir=locale==='ar'?'rtl':'ltr';area.lang=locale;
   if(loginForm)loginForm.hidden=!!mode;
   const actions=el('div');actions.className='wf-customer-auth-actions';
   if(mode)actions.append(button('back',()=>{if(busy)return;mode='';proof=null;message='';render();}));
   else{
    if(options.registrationEnabled)actions.append(button('register',()=>{mode='register';message='';render();}));
    if(options.recoveryEnabled)actions.append(button('recover',()=>{mode='recover';message='';render();}));
   }
   area.append(actions);if(message)area.append(note());if(!mode)return;
   const form=el('form');form.className='wf-customer-auth-form';form.autocomplete='on';
   const fields={};
   function field(key,{type='text',max=100,required=true,value='',auto='off'}={}){
    const label=el('label'),caption=el('span',t(key)),input=el('input');input.type=type;input.name=key;input.className='fi';input.maxLength=max;
    input.required=required;input.autocomplete=auto;input.value=value;input.disabled=busy;input.dir='auto';label.append(caption,input);form.append(label);fields[key]=input;
    if(Object.hasOwn(draft,key))input.addEventListener('input',()=>{draft[key]=input.value;});return input;
   }
   if(mode==='verify'){
    form.append(el('p',t(proof?.kind==='recover'?'recoveryIntro':'intro')));
    const password=field('password',{type:'password',max:128,auto:'new-password'}),repeat=field('repeat',{type:'password',max:128,auto:'new-password'});
    password.minLength=repeat.minLength=12;
   }else{
    form.append(el('p',t(mode==='register'?'intro':'recoveryIntro')));
    if(mode==='register'){
     field('name',{value:draft.name,auto:'name'});field('username',{value:draft.username,max:64,auto:'username'});
     field('company',{value:draft.company,required:false,auto:'organization'});
    }
    field('email',{type:'email',max:254,value:draft.email,auto:'email'});
    if(mode==='register'){
     const search=field('search',{type:'search',required:false});
     const label=el('label'),select=el('select');select.className='fi';select.name='country';select.required=true;select.disabled=busy;fields.country=select;
     let regionNames;try{regionNames=new Intl.DisplayNames([locale],{type:'region'});}catch(_){}
     const fill=()=>{const chosen=select.value||draft.country;select.replaceChildren();const query=search.value.toLocaleLowerCase();
      for(const code of countryCodes){const name=regionNames?.of(code)||code;if(query&&!name.toLocaleLowerCase().includes(query)&&!code.toLowerCase().includes(query)&&code!==chosen)continue;
       const option=el('option',name+' · '+code);option.value=code;select.append(option);}select.value=chosen;};
     search.addEventListener('input',fill);select.addEventListener('change',()=>{draft.country=select.value;});fill();label.append(el('span',t('country')),select);form.append(label);
     field('callingCode',{type:'tel',max:5,value:draft.callingCode,auto:'tel-country-code'}).pattern='\\+[1-9][0-9]{0,3}';
     field('phone',{type:'tel',max:14,value:draft.phone,auto:'tel-national'}).pattern='[0-9]{4,14}';
    }
   }
   const send=el('button',t(busy?'sending':mode==='verify'?(proof?.kind==='recover'?'finishRecovery':'finish'):'send'));send.className='btn btn-p';send.type='submit';send.disabled=busy;form.append(send);area.append(form);
   form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!form.reportValidity())return;const flow=mode;
    if(flow==='verify'&&(fields.password.value!==fields.repeat.value||Array.from(fields.password.value).length<12||Array.from(fields.password.value).length>128)){message=t('mismatch');render();return;}
    const input=Object.fromEntries(Object.entries(fields).filter(([key])=>key!=='search'&&key!=='repeat').map(([key,node])=>[key,node.value]));
    if(flow!=='verify')draft={...draft,...input};
    else{fields.password.value='';fields.repeat.value='';}
    busy=true;message='';render();
    try{
     if(flow==='verify'){
      if(!proof||proof.invalid)throw Object.assign(Error(),{code:'INVALID_EMAIL_LINK'});
      const result=await client.customerVerify({requestId:proof.requestId,tokenHash:proof.tokenHash,challenge:proof.challenge,password:input.password});
      if(!disposed){proof=null;mode='';message=t('complete');render();onComplete(result.username,message);}
     }else{
      const requestId=root.crypto.randomUUID();let captchaToken;
      if(typeof root.WOWAuthCaptcha?.execute==='function')captchaToken=await root.WOWAuthCaptcha.execute(flow);
      await client[flow==='register'?'customerRegister':'customerRecover']({...input,requestId,...(captchaToken?{captchaToken}:{})});
      if(!disposed){mode='';message=t('sent');}
     }
    }catch(error){if(!disposed){message=errorMessage(error);if(['INVALID_EMAIL_LINK','CUSTOMER_REGISTRATION_CONFLICT'].includes(error?.code)){proof=null;mode='';}}}
    finally{if(!disposed){busy=false;render();}}
   });
  }
  if(proof){mode=proof.invalid?'':'verify';if(proof.invalid)message=t('invalid');}
  render();
  const ready=Promise.resolve().then(()=>client.customerAuthOptions()).then(value=>{if(!disposed){options=value;render();}}).catch(error=>{if(!disposed){message=errorMessage(error);render();}});
  return {ready,updateLanguage(value){locale=langOf(value);render();},dispose(){disposed=true;proof=null;area.remove();if(loginForm)loginForm.hidden=false;}};
 }
 function mountOwner({container,api,lang='ar',origin=root.location?.origin}){
  if(!container||api?.can?.('accounts.edit')!==true)return {updateLanguage(){},dispose(){}};
  const doc=container.ownerDocument||root.document,area=doc.createElement('section');area.className='wf-customer-control';container.append(area);
  let locale=langOf(lang),disposed=false,busy=false,data=null,message='';
  const t=key=>text(key,locale),el=(tag,caption)=>{const n=doc.createElement(tag);if(caption!==undefined)n.textContent=caption;return n;};
  function render(){
   if(disposed)return;area.replaceChildren();area.append(el('h3',t('control')));
   if(message){const note=el('p',message);note.setAttribute('role','status');area.append(note);}
   if(!data)return;
   if(!data.configured)area.append(el('p',t('unavailable')));
   const form=el('form'),fields={};
   for(const [key,label] of [['registrationEnabled','signupEnabled'],['recoveryEnabled','recoveryEnabled']]){
    const row=el('label'),input=el('input');input.type='checkbox';input.checked=data.settings[key];input.disabled=busy||(!data.configured&&!data.settings[key]);fields[key]=input;row.append(input,el('span',t(label)));form.append(row);
   }
   const save=el('button',t(busy?'sending':'save'));save.type='submit';save.className='btn';save.disabled=busy;form.append(save);area.append(form);
   form.addEventListener('submit',async event=>{event.preventDefault();if(busy)return;await load('customerAuth.configure',{revision:data.settings.revision,registrationEnabled:fields.registrationEnabled.checked,recoveryEnabled:fields.recoveryEnabled.checked});});
   if(typeof origin==='string'&&origin.startsWith('https://')){
    const url=new URL('/',origin);url.searchParams.set('wf-cloud','employee');url.searchParams.set('workspace',data.workspaceId);url.hash='gallery';
    const label=el('label'),link=el('input');link.type='url';link.readOnly=true;link.value=url.href;link.className='fi';label.append(el('span',t('link')),link);area.append(label);
   }
   for(const [label,key] of [['accepted','accepted24h'],['failed','failed24h'],['finished','completed24h']])area.append(el('p',t(label)+': '+new Intl.NumberFormat(locale).format(data[key]||0)));
   area.append(el('p',t('deliveryNote')));
  }
  async function load(action='customerAuth.snapshot',payload={}){
   if(disposed||busy)return;busy=true;render();
   try{const next=await api.request(action,payload);if(!disposed){data=next;message=action==='customerAuth.configure'?t('saved'):'';}}
   catch(error){if(!disposed)message=t(error?.code==='CUSTOMER_AUTH_UNAVAILABLE'?'unavailable':'error');}
   finally{if(!disposed){busy=false;render();}}
  }
  const ready=load();
  return {ready,updateLanguage(value){locale=langOf(value);render();},dispose(){disposed=true;area.remove();}};
 }
 return Object.freeze({mountVisitor,mountOwner,captureProof,countryCodes:Object.freeze(countryCodes)});
});
