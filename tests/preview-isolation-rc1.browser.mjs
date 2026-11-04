import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,existsSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildRc1Preview} from '../scripts/build-rc1-preview.mjs';

const temp=mkdtempSync(join(tmpdir(),'travelit-preview-browser-'));
const outputDir=join(temp,'preview');
const rootDir=fileURLToPath(new URL('../',import.meta.url));
const result=buildRc1Preview({rootDir,outputDir});
const port=8661,url='http://127.0.0.1:'+port+'/';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:result.outputDir,stdio:'ignore'});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const page=await context.newPage(),faults=[];
let blockedContext=null;
page.on('pageerror',e=>faults.push(e.message));
async function ready(){for(let i=0;i<55;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw Error('Isolated preview test server unavailable.');}
try{
 await ready();
 await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.getByText('RC1 PREVIEW · TEST DATA ONLY').waitFor();
 await page.locator('[data-view="trips"]:visible').first().click();
 await page.locator('[data-action="new-trip"]:visible').first().click();
 await page.locator('#f-title').fill('Synthetic preview journey');
 await page.locator('#f-startDate').fill('2026-12-05');
 await page.locator('#f-endDate').fill('2026-12-07');
 await page.locator('#modal-form button[type=submit]').click();
 await page.locator('#modal-backdrop').waitFor({state:'hidden',timeout:15000});
 const initial=await page.evaluate(async()=>({
  dbs:await indexedDB.databases(),
  keys:await caches.keys(),
  productionTopic:localStorage.getItem('travelit-workspace-changes-v1'),
  previewTopic:localStorage.getItem('travelit-rc1-preview-workspace-changes-v1')
 }));
 assert.ok(initial.dbs.some(x=>x.name==='travelit-rc1-preview'),'Preview database must exist');
 assert.ok(!initial.dbs.some(x=>x.name==='travelit-foundation'),'Production database must never be opened');
 assert.equal(initial.productionTopic,null,'Production BroadcastChannel/localStorage topic must be untouched');
 assert.ok(initial.previewTopic,'Preview updates must use its own topic');
 await page.waitForFunction(async()=>{
  try{
   const {verifyOfflineShell}=await import('./js/offline-shell.js');
   return (await verifyOfflineShell({scope:new URL('./',location.href).href})).ready;
  }catch{return false;}
 },undefined,{timeout:35000});
 const cacheKeys=await page.evaluate(()=>caches.keys());
 assert.ok(cacheKeys.includes(result.cache),'Preview shell cache not installed');
 assert.ok(!cacheKeys.some(x=>x.startsWith('travelit-foundation-shell-')),'Production cache must never be created');

 await page.locator('.preview-qa-link').click();
 await page.locator('#automatic-checks [data-check="storage"][data-status="pass"]').waitFor();
 await page.locator('#automatic-checks [data-check="offline"][data-status="pass"]').waitFor();
 await page.locator('#automatic-checks [data-check="keepit"][data-status="pass"]').waitFor();
 assert.equal(await page.locator('[data-accept]').count(),6);
 await page.locator('[data-accept="standalone"]').check();
 const report=JSON.parse(await page.locator('#report-json').inputValue());
 assert.equal(report.manual.find(x=>x.id==='standalone').checked,true);
 assert.equal(report.automatic.find(x=>x.id==='keepit').status,'pass');
 assert.ok(!JSON.stringify(report).includes('Synthetic preview journey'),'QA report must exclude trip content');
 await context.setOffline(true);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#automatic-checks [data-check="offline"][data-status="pass"]').waitFor();
 assert.equal(await page.locator('[data-accept="standalone"]').isChecked(),true,'Manual acceptance state should persist locally');
 await page.locator('#reset-acceptance').click();
 assert.equal(await page.locator('[data-accept="standalone"]').isChecked(),false,'Reset clears synthetic acceptance flags');
 await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.locator('[data-view="trips"]:visible').first().click();
 await page.getByText('Synthetic preview journey').first().waitFor();
 assert.equal(faults.length,0,'Page errors: '+faults.join('; '));
 // This is a brand-new isolated browser context. Intercept every GitHub Pages
 // request with the preview files, without reaching the real production site.
 blockedContext=await browser.newContext({viewport:{width:390,height:844}});
 await blockedContext.route('https://kdg-007.github.io/**',async route=>{
  const url=new URL(route.request().url());
  const relative=url.pathname.replace(/^\/rc1-preview\/?/,'')||'index.html';
  const file=join(result.outputDir,relative);
  if(!existsSync(file)){await route.fulfill({status:404,body:'Not found'});return;}
  const mime=relative.endsWith('.js')?'text/javascript':
   relative.endsWith('.css')?'text/css':
   relative.endsWith('.webmanifest')?'application/manifest+json':
   relative.endsWith('.svg')?'image/svg+xml':'text/html';
  await route.fulfill({status:200,contentType:mime,body:readFileSync(file)});
 });
 const blocked=await blockedContext.newPage();
 await blocked.goto('https://kdg-007.github.io/rc1-preview/',{waitUntil:'domcontentloaded'});
 await blocked.locator('#main').getByText('This RC1 preview will not run on the existing GitHub Pages origin').waitFor();
 assert.equal(await blocked.locator('[data-view="trips"]:visible').count(),0,'Blocked preview must not start app');
 // Simulate a real existing TravelIt user on the SAME GitHub Pages origin.
 // Loading an unsafe preview may not open/replace the production database or cache.
 const seeded=await blocked.evaluate(async()=>{
  const rq=indexedDB.open('travelit-foundation',4);
  rq.onupgradeneeded=()=>{if(!rq.result.objectStoreNames.contains('records'))rq.result.createObjectStore('records',{keyPath:'key'});};
  const db=await new Promise((resolve,reject)=>{rq.onsuccess=()=>resolve(rq.result);rq.onerror=()=>reject(rq.error);});
  const tx=db.transaction('records','readwrite');
  tx.objectStore('records').put({key:'trip:do-not-touch',type:'trip',id:'do-not-touch',data:{id:'do-not-touch',title:'Existing family trip'}});
  await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
  db.close();
  const cache=await caches.open('travelit-foundation-shell-v0.33-b4');
  await cache.put('/travelit-alpha/index.html',new Response('existing application'));
  localStorage.setItem('travelit-workspace-changes-v1','ORIGINAL');
  return {dbs:await indexedDB.databases(),caches:await caches.keys()};
 });
 assert.equal(seeded.dbs.length,1);
 assert.equal(seeded.caches.length,1);
 await blocked.reload({waitUntil:'domcontentloaded'});
 await blocked.locator('#main').getByText('This RC1 preview will not run on the existing GitHub Pages origin').waitFor();
 const blockedStores=await blocked.evaluate(async()=>{
  const rq=indexedDB.open('travelit-foundation',4);
  const db=await new Promise((resolve,reject)=>{rq.onsuccess=()=>resolve(rq.result);rq.onerror=()=>reject(rq.error);});
  const tx=db.transaction('records','readonly'),r=tx.objectStore('records').get('trip:do-not-touch');
  const item=await new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  db.close();
  return {dbs:await indexedDB.databases(),caches:await caches.keys(),item,topic:localStorage.getItem('travelit-workspace-changes-v1')};
 });
 assert.deepEqual(blockedStores.dbs.map(x=>x.name),['travelit-foundation'],'Blocked preview must not create another DB');
 assert.deepEqual(blockedStores.caches,['travelit-foundation-shell-v0.33-b4'],'Blocked preview must not replace the production shell');
 assert.equal(blockedStores.item?.data?.title,'Existing family trip','Existing TravelIt record changed');
 assert.equal(blockedStores.topic,'ORIGINAL','Existing workspace notice storage changed');
 console.log('RC1_PREVIEW_BROWSER_PASS: test watermark, separate DB/topic/cache, controlled offline shell, offline reopen');
}finally{
 await context.setOffline(false).catch(()=>{});
 if(blockedContext)await blockedContext.close();
 await context.close();await browser.close();server.kill();
 rmSync(temp,{recursive:true,force:true});
}
