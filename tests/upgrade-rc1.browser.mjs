import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,cpSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const port=8663,url='http://127.0.0.1:'+port+'/';
const staging=mkdtempSync(join(tmpdir(),'travelit-upgrade-'));
const result=spawnSync('git',['archive','--format=tar','refs/remotes/origin/main'],{encoding:null});
if(result.status!==0){rmSync(staging,{recursive:true,force:true});throw Error('Baseline main ref unavailable. CI must fetch origin main before upgrade test: '+String(result.stderr));}
const extracted=spawnSync('tar',['-xf','-','-C',staging],{input:result.stdout});
if(extracted.status!==0){rmSync(staging,{recursive:true,force:true});throw Error('Unable to extract pre-upgrade TravelIt baseline: '+String(extracted.stderr));}
const oldWorker=readFileSync(join(staging,'sw.js'),'utf8');
const newWorker=readFileSync('sw.js','utf8');
const oldName=/const CACHE='([^']+)'/.exec(oldWorker)?.[1];
const newName=/const CACHE='([^']+)'/.exec(newWorker)?.[1];
assert.ok(oldName&&newName&&oldName!==newName,'The installed cache version must change between B4 and RC1.');
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',staging],{stdio:'ignore'});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'allow',acceptDownloads:true});
const page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
async function ready(){for(let i=0;i<50;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw Error('Upgrade fixture HTTP server unavailable');}
async function serviceWorkerReady(name){
 await page.waitForFunction(async cacheName=>{
  try{return Boolean(navigator.serviceWorker.controller)&&(await caches.keys()).includes(cacheName);}catch{return false;}
 },name,{timeout:35000});
}
try{
 await ready();
 await page.goto(url,{waitUntil:'networkidle'});
 await page.locator('[data-view="trips"]').last().click();
 await page.locator('[data-action="new-trip"]').first().click();
 await page.locator('#f-title').fill('Upgrade Data Preservation QA');
 await page.locator('#f-startDate').fill('2026-12-05');
 await page.locator('#f-endDate').fill('2026-12-08');
 await page.locator('#modal-form button[type=submit]').click();
 await page.locator('#modal-backdrop').waitFor({state:'hidden',timeout:15000});
 await page.getByText('Upgrade Data Preservation QA').first().waitFor();
 await serviceWorkerReady(oldName);
 const before=await page.evaluate(async()=>{
  const open=indexedDB.open('travelit-foundation');
  const db=await new Promise((resolve,reject)=>{open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);});
  const tx=db.transaction('records','readonly');
  const request=tx.objectStore('records').getAll();
  const data=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  db.close();return data.map(x=>({key:x.key,type:x.type,id:x.id,data:x.data}));
 });
 const trip=before.find(x=>x.type==='trip'&&x.data.title==='Upgrade Data Preservation QA');
 assert.ok(trip,'B4 trip missing before upgrade');
 
 // Replace only static application files served from the SAME browser origin.
 // No IndexedDB, CacheStorage or browser profile is cleared.
 for(const path of ['css','js','icons']){
  cpSync(resolve(path),join(staging,path),{recursive:true,force:true});
 }
 for(const path of ['index.html','sw.js','manifest.webmanifest']){
  cpSync(resolve(path),join(staging,path),{force:true});
 }
 await page.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();if(!reg)throw Error('Missing installed baseline worker');await reg.update();});
 await page.waitForFunction(async({cacheName,oldCache})=>{
  try{
   const registration=await navigator.serviceWorker.getRegistration();
   const names=await caches.keys();
   if(!names.includes(cacheName)||names.includes(oldCache)||registration?.installing||registration?.waiting
       ||registration?.active?.state!=='activated'||navigator.serviceWorker.controller!==registration.active)return false;
   const cache=await caches.open(cacheName);
   const [entryPoint,backupModule]=await Promise.all([
    cache.match(new URL('./index.html',location.href).href),
    cache.match(new URL('./js/backup.js',location.href).href)
   ]);
   return Boolean(entryPoint?.ok&&backupModule?.ok);
  }catch{return false;}
 },{cacheName:newName,oldCache:oldName},{timeout:45000});
 // Precaching must fetch CURRENT bytes even if the HTTP cache has stale B4 modules.
 const moduleCheck=await page.evaluate(async cacheName=>{
  const cache=await caches.open(cacheName);
  const url=new URL('./js/backup.js',location.href).href;
  const items=(await cache.keys()).map(x=>x.url);
  const found=await cache.match(url);
  const text=await found?.text()||'';
  return {url,items,matched:Boolean(found),newModule:text.includes('MAX_BACKUP_IMPORT_BYTES'),moduleStart:text.slice(0,220),cacheNames:await caches.keys()};
 },newName);
 assert.ok(moduleCheck.newModule,'New worker did not cache current RC1 backup module: '+JSON.stringify(moduleCheck));
 await page.reload({waitUntil:'domcontentloaded'});
 try{
  await page.locator('[data-view="trips"]').last().waitFor({timeout:12000});
 }catch(error){
  const debug=await page.evaluate(async()=>({
   pageText:document.body?.innerText?.slice(0,1800),
   script:document.querySelector('script[type="module"]')?.src,
   caches:await caches.keys(),
   registration:(await navigator.serviceWorker.getRegistration())?.active?.state,
   controller:navigator.serviceWorker.controller?.state,
   databaseNames:typeof indexedDB.databases==='function'?await indexedDB.databases():null
  })).catch(e=>({debugError:String(e)}));
  throw Error('Upgrade restart failed: '+JSON.stringify({errors,debug,reason:String(error)}));
 }
 await page.locator('[data-view="trips"]').last().click();
 await page.getByText('Upgrade Data Preservation QA').first().waitFor({timeout:18000});
 const status=await page.evaluate(async()=>{
  const {verifyOfflineShell}=await import('./js/offline-shell.js');
  return verifyOfflineShell({scope:new URL('./',location.href).href});
 });
 assert.equal(status.ready,true,'RC1 installed shell must be complete after update: '+JSON.stringify(status));
 const after=await page.evaluate(async()=>{
  const open=indexedDB.open('travelit-foundation');
  const db=await new Promise((resolve,reject)=>{open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);});
  const tx=db.transaction('records','readonly'),request=tx.objectStore('records').getAll();
  const data=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  db.close();return data.map(x=>({key:x.key,type:x.type,id:x.id,data:x.data}));
 });
 const preserved=after.find(x=>x.key===trip.key);
 assert.ok(preserved,'Existing B4 trip record disappeared after RC1 upgrade');
 assert.equal(preserved.id,trip.id,'Upgrade changed identity');
 assert.equal(preserved.data.title,trip.data.title,'Upgrade changed title');
 assert.equal(preserved.data.startDate,trip.data.startDate,'Upgrade changed departure date');
 assert.equal(preserved.data.endDate,trip.data.endDate,'Upgrade changed return date');
 
 // Validate that current RC1 can still mutate upgraded data and re-open offline.
 await page.locator('[data-trip-tab="info"]').click();
 await page.locator('[data-action^="add-note:trip:"]').first().click();
 await page.locator('#f-title').fill('Note after update');
 await page.locator('#f-content').fill('Upgrade retained the original trip.');
 await page.locator('#modal-form button[type=submit]').click();
 await page.locator('#modal-backdrop').waitFor({state:'hidden',timeout:15000});
 await page.getByText('Note after update').first().waitFor();
 await context.setOffline(true);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('[data-view="trips"]').last().click();
 await page.getByText('Upgrade Data Preservation QA').first().waitFor();
 await page.locator('[data-trip-tab="info"]').click();
 await page.getByText('Note after update').first().waitFor();
 assert.equal(errors.length,0,'Browser errors during upgrade: '+errors.join('; '));
 console.log('RC1_UPGRADE_PASS: B4 same-origin data preserved, app shell updated, new notes save, and installed PWA reopens offline');
}finally{
 await context.setOffline(false).catch(()=>{});
 await context.close();
 await browser.close();
 server.kill();
 rmSync(staging,{recursive:true,force:true});
}
