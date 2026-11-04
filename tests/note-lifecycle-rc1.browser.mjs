import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
const port=8641,url='http://127.0.0.1:'+port+'/';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
async function ready(){for(let i=0;i<45;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw Error('Note QA server unavailable');}
try{
 await ready();await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.locator('[data-view="trips"]').last().click();
 await page.locator('[data-action="new-trip"]').first().click();
 await page.locator('#f-title').fill('Editor lifecycle QA');
 await page.locator('#f-startDate').fill('2026-12-05');
 await page.locator('#f-endDate').fill('2026-12-07');
 await page.locator('#modal-form button[type=submit]').click();
 await page.locator('[data-trip-tab="info"]').click();
 await page.locator('[data-action^="add-note:trip:"]').first().click();
 await page.locator('#f-title').fill('Repeat editor note');
 await page.locator('#f-content').fill('alpha');
 await page.locator('#note-save-status').getByText('Saved on this device').waitFor({timeout:15000});
 await page.locator('#modal-form button[type=submit]').click();
 await page.getByText('Repeat editor note').first().waitFor();
 // A prior handler on the permanent modal body used to cause double/triple formatting.
 for(let i=0;i<2;i++){
  await page.locator('[data-action^="edit-note:"]').first().click();
  await page.locator('#modal-form button[type=submit]').click();
  await page.locator('#modal-backdrop').waitFor({state:'hidden',timeout:15000});
 }
 await page.locator('[data-action^="edit-note:"]').first().click();
 const body=page.locator('#f-content');
 await body.fill('alpha');
 await body.evaluate(el=>el.setSelectionRange(0,5));
 await page.locator('[data-action="note-format:bold"]').first().click();
 assert.equal(await body.inputValue(),'**alpha**','Only one formatting handler should run');
 await page.locator('#modal-form button[type=submit]').click();
 // Browser click completion is not completion of the asynchronous IndexedDB save.
 // Wait for the editor to close only after onSubmit has durably resolved.
 await page.locator('#modal-backdrop').waitFor({state:'hidden',timeout:15000});
 await page.getByText('Repeat editor note').first().waitFor();
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('[data-view="trips"]').last().click();
 await page.locator('[data-trip-tab="info"]').click();
 await page.locator('[data-action^="edit-note:"]').first().click();
 assert.equal(await page.locator('#f-content').inputValue(),'**alpha**');
 assert.equal(errors.length,0,errors.join('; '));
 console.log('RC1_NOTE_LIFECYCLE_PASS: one-format action across repeated editors, persisted on reload');
}finally{await context.close();await browser.close();server.kill();}
