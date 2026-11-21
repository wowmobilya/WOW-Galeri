#!/usr/bin/env node
'use strict';

/*
 * Development-only full-app account fixture. The generated page and scripts
 * belong in a disposable preview directory, outside the source checkout.
 *
 * Usage:
 *   node docs/qa/build-accounts-app-209.cjs [source-index.html] [output/accounts-app-209.html]
 *
 * Synchronize the app's ordinary assets into the preview directory first.
 * This generator never edits index.html, production scripts, or identity data.
 * The normal business database is still used by the actual app; serve this
 * fixture only from the disposable QA origin whose business data is synthetic.
 */
const fs = require('node:fs');
const path = require('node:path');

function fixtureIdentity() {
  'use strict';
  if (!/\/accounts-app-209\.html$/.test(location.pathname)) throw new Error('QA_FIXTURE_PAGE_REQUIRED');
  if (!window.WFAccountPolicy || !window.WFAccountsCore || !window.WFAccountsLocalProvider) throw new Error('QA_FIXTURE_MODULE_ORDER');
  const query = new URLSearchParams(location.search);
  const requested = query.get('demo');
  const role = ['owner','carpentry','sales'].includes(requested) ? requested : 'carpentry';
  const locale = ['ar','en','tr','fr','ru'].includes(query.get('lang')) ? query.get('lang') : 'ar';
  const preferences = new Map([['wf_lang',locale],['wf_theme',query.get('theme') === 'dark' ? 'dark' : 'light']]);
  const tabPreferences = new Map();
  Object.defineProperty(window,'sessionStorage',{configurable:true,value:{
    getItem:key=>tabPreferences.get(String(key)) ?? null,
    setItem:(key,value)=>tabPreferences.set(String(key),String(value)),
    removeItem:key=>tabPreferences.delete(String(key)),
    clear:()=>tabPreferences.clear()
  }});
  Object.defineProperty(window,'localStorage',{configurable:true,value:{
    getItem:key=>preferences.get(String(key)) ?? null,
    setItem:(key,value)=>preferences.set(String(key),String(value)),
    removeItem:key=>preferences.delete(String(key)),
    clear:()=>preferences.clear()
  }});
  // This page never signals a real application's local identity channel.
  Object.defineProperty(window,'BroadcastChannel',{configurable:true,value:class {postMessage(){}close(){}}});
  let identity = null;
  const clone = value => value == null ? null : structuredClone(value);
  const read = async () => clone(identity);
  const commit = async (expected,next) => {
    if ((identity?.revision ?? 0) !== expected) {const error=new Error('CONFLICT');error.code='CONFLICT';throw error;}
    if (!next || next.revision !== expected+1) throw new Error('QA_INVALID_REVISION');
    identity = clone(next);
  };
  // The real provider definition was loaded; its factory is replaced before
  // accounts-access creates a provider, so no identity IndexedDB is opened.
  window.WFAccountsLocalProvider = {create:()=>({read,commit,close(){}})};
  const originalCore = window.WFAccountsCore;
  let runtimeCreated = false;
  window.WFAccountsCore = Object.freeze({...originalCore,createService(options) {
    const service = originalCore.createService(options);
    if (runtimeCreated) return service;
    runtimeCreated = true;
    let initialized = false, initializing = null;
    const refresh = () => {
      if (initialized) return service.refresh();
      if (!initializing) initializing = (async () => {
        await service.refresh();
        await service.bootstrapOwner({name:'مالك اصطناعي · QA Owner',username:'qa.owner',password:'DemoOwner2026!'});
        await service.createAccount({
          name:'موظف نجارة اصطناعي · QA Wood',username:'qa.wood',password:'DemoWorker2026!',
          role:'carpentry',permissions:WFAccountPolicy.presets('carpentry'),department:'نجارة · QA',
          note:'حساب اصطناعي في ذاكرة صفحة الاختبار فقط',expiresAt:null
        });
        await service.createAccount({
          name:'موظفة مبيعات اصطناعية · QA Sales',username:'qa.sales',password:'DemoWorker2026!',
          role:'sales',permissions:WFAccountPolicy.presets('sales'),department:'مبيعات · QA',
          note:'حساب اصطناعي لا يمثل موظفًا حقيقيًا',expiresAt:null
        });
        const credentials = {
          owner:{username:'qa.owner',password:'DemoOwner2026!'},
          carpentry:{username:'qa.wood',password:'DemoWorker2026!'},
          sales:{username:'qa.sales',password:'DemoWorker2026!'}
        };
        await service.signIn(credentials[role]);
        initialized = true;
        document.documentElement.dataset.qaAccountDemo = role;
        document.documentElement.dataset.qaAccountIdentity = 'memory-only';
        return service.getSnapshot();
      })();
      return initializing;
    };
    return Object.freeze({...service,refresh});
  }});
  document.title = 'QA · حساب اصطناعي · ' + document.title;
  window.QA_ACCOUNTS_APP_209 = Object.freeze({synthetic:true,role,identityPersistence:'memory-only'});
}

function build(source, target) {
  source = path.resolve(source);
  target = path.resolve(target);
  const repository = path.resolve(__dirname,'../..');
  const withinRepository = path.relative(repository,target);
  if (source === target || !withinRepository.startsWith('..' + path.sep) && !path.isAbsolute(withinRepository)) {
    throw new Error('Generate this preview outside the source repository.');
  }
  if (path.basename(target) !== 'accounts-app-209.html') throw new Error('The preview filename must be accounts-app-209.html.');
  let html = fs.readFileSync(source,'utf8');
  const accessPattern = /<script\b(?=[^>]*\bsrc=["'](?:\.\/)?accounts-access\.js(?:\?[^"']*)?["'])[^>]*>\s*<\/script\s*>/gi;
  const matches = [...html.matchAll(accessPattern)];
  if (matches.length !== 1 || !/\bdefer\b/.test(matches[0][0]) ||
      html.indexOf('accounts-local-provider.js') < 0 ||
      html.indexOf('accounts-local-provider.js') > matches[0].index) {
    throw new Error('Expected one deferred accounts-access.js script after accounts-local-provider.js.');
  }
  const directory = path.dirname(target);
  fs.mkdirSync(directory,{recursive:true});
  const prefix = '__qa_accounts_app_209';
  const fixtureName = prefix + '_identity.js';
  const fixtureSource = '/* GENERATED PREVIEW ONLY. Synthetic in-memory accounts; never deploy as the app. */\n(' + fixtureIdentity.toString() + ')();\n';
  fs.writeFileSync(path.join(directory,fixtureName),fixtureSource);
  const generated = [fixtureName];
  const cloudScript=html.match(/<script\b(?=[^>]*\bsrc=["'](?:\.\/)?modules/platform/cloud/wow-cloud-config\.js(?:\?[^"']*)?["'])[^>]*>\s*<\/script\s*>/i)?.[0];
  const fixtureAnchor=cloudScript||matches[0][0];
  html = html.replace(fixtureAnchor,'<script src="' + fixtureName + '" defer></script>\n' + fixtureAnchor);
  // The preview host uses external script assets. Preserve each original
  // script's attributes and execution order while giving it a unique QA name.
  html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi,(whole,attributes,body) => {
    if (/\bsrc\s*=/.test(attributes) || !body.trim()) return whole;
    const type = attributes.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1];
    if (type && !['module','text/javascript','application/javascript'].includes(type)) return whole;
    const name = prefix + '_inline_' + (generated.length-1) + '.js';
    fs.writeFileSync(path.join(directory,name),body);
    generated.push(name);
    return '<script' + attributes + ' src="' + name + '"></script>';
  });
  html = '<!-- GENERATED PREVIEW ONLY: actual app with synthetic, memory-only account fixtures. -->\n' + html;
  fs.writeFileSync(target,html);
  return {source,target,generated};
}

module.exports = {build,fixtureIdentity};
if (require.main === module) {
  const source = process.argv[2] || path.resolve(__dirname,'../../index.html');
  const target = process.argv[3] || path.join(require('node:os').tmpdir(),'wow-accounts-209-preview','accounts-app-209.html');
  try {
    const result = build(source,target);
    process.stdout.write('Generated ' + result.target + '\n' + result.generated.length + ' preview-only script assets written.\n');
  } catch(error) {process.stderr.write(error.message + '\n');process.exitCode=1;}
}
