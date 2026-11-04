import assert from 'node:assert/strict';
import {webkit} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildRc1Preview} from '../scripts/build-rc1-preview.mjs';

const workspace=mkdtempSync(join(tmpdir(),'travelit-rc1-preview-webkit-'));
const rootDir=fileURLToPath(new URL('../',import.meta.url));
const preview=buildRc1Preview({rootDir,outputDir:join(workspace,'app')});
const port=8642,url='http://127.0.0.1:'+port+'/';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:preview.outputDir,stdio:'ignore'});
const browser=await webkit.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'allow'});
const page=await context.newPage(),faults=[];
page.on('pageerror',e=>faults.push(e.message));
async function ready(){
 for(let n=0;n<60;n++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,250));}
 throw Error('Preview WebKit fixture server unavailable.');
}
async function poll(predicate,timeout=40000){
 const started=Date.now();
 while(Date.now()-started<timeout){
  if(await page.evaluate(predicate))return;
  await new Promise(r=>setTimeout(r,250));
 }
 throw Error('Timed out waiting for genuine active WebKit service-worker control.');
}
async function noOverflow(label){
 const metrics=await page.evaluate(()=>({window:document.documentElement.clientWidth,content:document.documentElement.scrollWidth}));
 assert.ok(metrics.content<=metrics.window+3,label+' horizontal overflow: '+JSON.stringify(metrics));
}
try{
 await ready();
 await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.getByText('RC1 PREVIEW · TEST DATA ONLY').waitFor();
 await noOverflow('Preview Explore');
 await page.locator('[data-view="trips"]').last().click();
 await page.locator('[data-action="new-trip"]').first().click();
 await page.locator('#f-title').fill('Disposable Safari QA trip');
 await page.locator('#f-startDate').fill('2026-12-05');
 await page.locator('#f-endDate').fill('2026-12-06');
 await page.locator('#modal-form button[type=submit]').click();
 await page.locator('#modal-backdrop').waitFor({state:'hidden',timeout:15000});
 await page.getByText('Disposable Safari QA trip').first().waitFor();
 await noOverflow('Preview Trip');
 await poll(async()=>{
  try{
   const registration=await navigator.serviceWorker?.getRegistration();
   return Boolean(navigator.serviceWorker?.controller&&registration?.active?.state==='activated');
  }catch{return false;}
 },35000);
 await page.locator('.preview-qa-link').click();
 await page.locator('#automatic-checks [data-check="keepit"][data-status="pass"]').waitFor();
 await page.locator('#automatic-checks [data-check="offline"][data-status="pass"]').waitFor({timeout:40000});
 await noOverflow('Preview QA');
 const diagnostics=JSON.parse(await page.locator('#report-json').inputValue());
 assert.equal(diagnostics.automatic.find(x=>x.id==='origin').status,'info','Localhost is only a simulation, not a real iPhone HTTPS acceptance');
 assert.equal(diagnostics.automatic.find(x=>x.id==='keepit').status,'pass');
 assert.equal(diagnostics.automatic.find(x=>x.id==='offline').status,'pass');
 assert.ok(!JSON.stringify(diagnostics).includes('Disposable Safari QA trip'),'Diagnostics must never export trip contents');
 await page.locator('[data-accept="standalone"]').check();
 await page.locator('[data-accept="offline"]').check();
 await context.setOffline(true);
 // The QA guide is an actual separate HTML navigation, not the root shell
 // fallback. Catch accidental delivery of index.html as qa.html in Airplane Mode.
 await page.reload({waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'iPhone acceptance checklist'}).waitFor();
 assert.equal(await page.locator('[data-accept="standalone"]').isChecked(),true);
 assert.equal(await page.locator('[data-accept="offline"]').isChecked(),true);
 await page.locator('#automatic-checks [data-check="offline"][data-status="pass"]').waitFor();
 const offlineReport=JSON.parse(await page.locator('#report-json').inputValue());
 assert.equal(offlineReport.manual.find(x=>x.id==='offline').checked,true);
 await page.locator('#reset-acceptance').click();
 assert.equal(await page.locator('[data-accept]:checked').count(),0);
 await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.locator('[data-view="trips"]').last().click();
 await page.getByText('Disposable Safari QA trip').first().waitFor();
 assert.equal(faults.length,0,'Unexpected WebKit JavaScript errors: '+faults.join('; '));
 console.log('RC1_PREVIEW_WEBKIT_PASS: isolated preview, mobile widths, active cache, offline QA page, checklist reset, saved synthetic trip.');
}catch(error){
 await context.setOffline(false).catch(()=>{});
 await page.screenshot({path:'travelit-preview-webkit-failure.png',fullPage:true}).catch(()=>{});
 throw error;
}finally{
 await context.setOffline(false).catch(()=>{});
 await context.close();
 await browser.close();
 server.kill();
 rmSync(workspace,{recursive:true,force:true});
}
