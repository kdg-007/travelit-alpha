import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';

const port=8631,url='http://127.0.0.1:'+port+'/';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({
 viewport:{width:390,height:844},isMobile:true,hasTouch:true,
 serviceWorkers:'allow'
});
let page=null;
const errors=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function serverReady(){
 for(let i=0;i<45;i++){
  try{if((await fetch(url)).ok)return;}catch{}
  await sleep(250);
 }
 throw Error('Local server not available');
}
try{
 await serverReady();
 page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url,{waitUntil:'networkidle'});
 await page.locator('[data-view="trips"]').last().waitFor();

 // An installed service worker must control the actual page and hold all
 // app-shell files, not merely report that a registration object exists.
 await page.waitForFunction(async()=>{
  try{
   const {verifyOfflineShell}=await import('./js/offline-shell.js');
   const result=await verifyOfflineShell({scope:new URL('./',location.href).href});
   return result.ready;
  }catch{return false;}
 },undefined,{timeout:30000});

 await page.locator('[data-view="trips"]').last().click();
 await page.locator('[data-action="new-trip"]').first().click();
 await page.locator('#f-title').fill('RC1 Offline Weekend');
 await page.locator('#f-startDate').fill('2026-12-05');
 await page.locator('#f-endDate').fill('2026-12-07');
 await page.locator('#modal-form button[type=submit]').click();
 await page.locator('[data-trip-tab="packing"]').click();
 await page.locator('[data-action="packing-mindmap"]').click();
 await page.locator('#packing-tree').waitFor();
 await page.locator('[data-pack-tree-add-branch]').click();
 const branch=page.locator('[data-pack-tree-branch]').last();
 await branch.locator('[data-pack-tree-group]').fill('Offline checks');
 await branch.locator('[data-pack-tree-item]').first().fill('Travel documents copy');
 await page.locator('#modal-form button[type=submit]').click();
 await page.getByText('Travel documents copy').first().waitFor();

 // Simulate loss of internet across all requests, while retaining the
 // service worker and IndexedDB: this is NOT an offline road-map test.
 await context.setOffline(true);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('[data-view="trips"]').last().waitFor({timeout:15000});
 await page.locator('[data-view="trips"]').last().click();
 await page.getByText('RC1 Offline Weekend').first().waitFor();
 await page.locator('[data-trip-tab="packing"]').click();
 await page.getByText('Travel documents copy').first().waitFor();

 const shell=await page.evaluate(async()=>{
  const {verifyOfflineShell}=await import('./js/offline-shell.js');
  return verifyOfflineShell({scope:new URL('./',location.href).href});
 });
 assert.equal(shell.ready,true,JSON.stringify(shell));
 assert.equal(shell.missing.length,0);

 // Even a completely new app tab must reopen while offline from the
 // already-installed app shell and the shared local persistent workspace.
 const fresh=await context.newPage();
 fresh.on('pageerror',e=>errors.push('offline-tab: '+e.message));
 await fresh.goto(url,{waitUntil:'domcontentloaded'});
 await fresh.locator('[data-view="trips"]').last().click();
 await fresh.getByText('RC1 Offline Weekend').first().waitFor();
 await fresh.locator('[data-trip-tab="packing"]').click();
 await fresh.getByText('Travel documents copy').first().waitFor();
 await fresh.close();
 assert.equal(errors.length,0,errors.join('; '));
 console.log('RC1_OFFLINE_PASS: controlled shell, airplane-mode reload, new offline tab, persistent trip and packing');
}finally{
 await context.setOffline(false).catch(()=>{});
 await context.close();
 await browser.close();
 server.kill();
}
