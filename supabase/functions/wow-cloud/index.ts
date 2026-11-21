import './accounts-policy.js';
import './accounts-data-policy.js';
import './product-cost-core.js';
import {createHandler} from './core.mjs';
import {createRestDependencies} from './rest.mjs';
import {createGalleryActions} from './modules/gallery.mjs';
import {createChatActions} from './modules/chat.mjs';
import {createFilesActions} from './modules/files.mjs';
import {createFinanceActions} from './modules/finance.mjs';
import {createQuoteProvider} from './modules/quote-provider.mjs';
import {createOperationsActions} from './modules/operations.mjs';
import {createAssistantActions} from './modules/assistant.mjs';
import {createAssistantProvider} from './modules/assistant-provider.mjs';
import {createOfflineGrantActions} from './modules/offline-grant.mjs';
import {createStorageMaintenance} from './modules/maintenance.mjs';
import {createCustomerAuthActions,createCustomerAuthProvider} from './modules/customer-auth.mjs';
import {createPublicShareActions,createPublicShareAPI} from './modules/public-share.mjs';
import {createCommunications} from './modules/communications.mjs';
import {createMailProvider} from './modules/mail-provider.mjs';

// These are Supabase's built-in server variables. They are never emitted in a
// response, logged, placed in app configuration, or copied to the repository.
const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');
const remote=createRestDependencies({url:Deno.env.get('SUPABASE_URL'),serviceKey:secretKeys.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')});
const origins=(Deno.env.get('WOW_ALLOWED_ORIGINS')||'https://markrobot.wowfurniture.com.tr,https://galeri.wowfurniture.com.tr')
  .split(',').map(value=>value.trim()).filter(Boolean);
const globals=globalThis as unknown as Record<string,unknown>;
const policy=globals.WFAccountPolicy as {permissionKeys:string[]};
const assistantProvider=createAssistantProvider({
  apiKey:Deno.env.get('OPENAI_API_KEY'),model:Deno.env.get('WOW_AI_MODEL'),
  receiptKey:Deno.env.get('WOW_AI_RECEIPT_KEY')
});
const customerAuth=createCustomerAuthActions({
  provider:createCustomerAuthProvider({url:Deno.env.get('SUPABASE_URL'),serviceKey:secretKeys.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}),
  auth:remote.auth,origins,enabled:Deno.env.get('WOW_CUSTOMER_AUTH_ENABLED')==='true'
});
const publicShareOptions={...remote,projectUrl:Deno.env.get('SUPABASE_URL'),publicOrigin:Deno.env.get('WOW_PUBLIC_APP_ORIGIN'),allowedOrigins:origins};
const publicShare=createPublicShareAPI(publicShareOptions);
const communications=createCommunications({moduleRpc:remote.moduleRpc,workerRpc:remote.communicationsRpc,
  provider:createMailProvider({apiKey:Deno.env.get('RESEND_API_KEY'),enabled:Deno.env.get('WOW_EMAIL_ENABLED')==='true',webhookSecret:Deno.env.get('RESEND_WEBHOOK_SECRET')})});
const storageMaintenance=createStorageMaintenance(remote);
const maintenance=async()=>{
  const results=await Promise.allSettled([storageMaintenance(),communications.process()]);
  if(results.some(result=>result.status==='rejected'))throw new Error('MAINTENANCE_DEFERRED');
};
const moduleActions={...createGalleryActions(remote),...createChatActions(remote),...createFilesActions(remote),
  ...customerAuth.actions,...createPublicShareActions(publicShareOptions),...communications.actions,
  ...createFinanceActions({...remote,quoteProvider:createQuoteProvider({goldApiKey:Deno.env.get('GOLDAPI_KEY')})}),
  ...createOperationsActions({...remote,configuration:{aiConfigured:assistantProvider.configured===true}}),
  ...createAssistantActions({moduleRpc:remote.moduleRpc,provider:assistantProvider}),
  ...createOfflineGrantActions({rpc:remote.rpc,origins,permissionKeys:policy.permissionKeys,
    endpoint:(Deno.env.get('SUPABASE_URL')||'').replace(/\/$/,'')+'/functions/v1/wow-cloud',
    signingKey:Deno.env.get('WOW_OFFLINE_OWNER_SIGNING_JWK')})};
const app=createHandler({...remote,origins,moduleActions,publicActions:customerAuth.publicActions,policy,dataPolicy:globals.WFAccountDataPolicy,costCore:globals.WFCostCore});
let worker: ((req:Request)=>Promise<Response>)|undefined;
Deno.serve(async(req:Request)=>{
  if(new URL(req.url).pathname.startsWith('/functions/v1/wow-cloud/public-share/'))return publicShare(req);
  if(new URL(req.url).pathname==='/functions/v1/wow-cloud/mail-webhook')return communications.webhook(req);
  if(new URL(req.url).pathname.endsWith('/health')){
    if(req.method!=='GET')return new Response(null,{status:405,headers:{Allow:'GET'}});
    try{
      const state=await remote.health();
      if(state?.ok!==true)throw new Error('UNAVAILABLE');
      return Response.json({ok:true,service:'mark-robot',checkedAt:state.checkedAt},{headers:{'Cache-Control':'no-store'}});
    }catch(_){return Response.json({ok:false,service:'mark-robot'},{status:503,headers:{'Cache-Control':'no-store'}});}
  }
  if(new URL(req.url).pathname.endsWith('/push-worker')){
    if(!worker){
      const [{createPushWorker},{generateRequestDetails}]=await Promise.all([import('./push-worker.mjs'),import('npm:web-push@4.0.0')]);
      worker=createPushWorker({rpc:remote.pushRpc,generateRequestDetails,maintenance});
    }
    return worker(req);
  }
  return app(req);
});
