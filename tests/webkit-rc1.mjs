import assert from 'node:assert/strict';
import {webkit} from 'playwright';
import {spawn} from 'node:child_process';

const port=8637,url='http://127.0.0.1:'+port+'/';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
const browser=await webkit.launch({headless:true});
const context=await browser.newContext({
 viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true
});
const page=await context.newPage();
const faults=[];page.on('pageerror',e=>faults.push(e.message));
async function ready(){
 for(let i=0;i<45;i++){
  try{if((await fetch(url)).ok)return;}catch{}
  await new Promise(r=>setTimeout(r,250));
 }
 throw Error('WebKit local test server unavailable');
}
async function checkWidth(label){
 const result=await page.evaluate(()=>({
  viewport:document.documentElement.clientWidth,
  scroll:document.documentElement.scrollWidth
 }));
 assert.ok(result.scroll<=result.viewport+3,label+' horizontal overflow '+JSON.stringify(result));
}
try{
 await ready();
 await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.locator('[data-view="trips"]').last().waitFor({timeout:15000});
 await checkWidth('Explore');
 await page.locator('[data-view="trips"]').last().click();
 await page.locator('[data-action="new-trip"]').first().click();
 await page.locator('#f-title').fill('RC1 WebKit mobile');
 await page.locator('#f-startDate').fill('2026-12-05');
 await page.locator('#f-endDate').fill('2026-12-07');
 await page.locator('#modal-form button[type=submit]').click();
 await page.getByText('RC1 WebKit mobile').first().waitFor();
 await checkWidth('Trip');
 await page.locator('[data-trip-tab="info"]').click();
 await page.locator('[data-action^="add-note:trip:"]').first().click();
 await page.locator('#f-title').fill('Offline journal');
 await page.locator('#f-content').fill('# Test note\n- Retained after reload');
 await page.locator('#note-save-status').getByText('Saved on this device').waitFor({timeout:15000});
 await page.locator('#modal-form button[type=submit]').click();
 await page.getByText('Offline journal').first().waitFor();
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('[data-view="trips"]').last().click();
 await page.getByText('RC1 WebKit mobile').first().waitFor();
 await page.locator('[data-trip-tab="info"]').click();
 await page.getByText('Offline journal').first().waitFor();
 await page.locator('[data-action^="edit-note:"]').first().click();
 assert.equal(await page.locator('#f-content').inputValue(),'# Test note\n- Retained after reload');
 await checkWidth('Note');
 assert.equal(faults.length,0,faults.join('; '));
 console.log('RC1_WEBKIT_PASS: mobile layout, trip creation, note autosave and reload');
}catch(e){
 await page.screenshot({path:'travelit-webkit-failure.png',fullPage:true}).catch(()=>{});
 throw e;
}finally{
 await context.close();
 await browser.close();
 server.kill();
}
