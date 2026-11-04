import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
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

 await context.setOffline(true);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('[data-view="trips"]:visible').first().click();
 await page.getByText('Synthetic preview journey').first().waitFor();
 assert.equal(faults.length,0,'Page errors: '+faults.join('; '));
 console.log('RC1_PREVIEW_BROWSER_PASS: test watermark, separate DB/topic/cache, controlled offline shell, offline reopen');
}finally{
 await context.setOffline(false).catch(()=>{});
 await context.close();await browser.close();server.kill();
 rmSync(temp,{recursive:true,force:true});
}
