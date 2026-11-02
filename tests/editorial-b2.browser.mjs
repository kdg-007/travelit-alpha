import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
const port=8563, url='http://127.0.0.1:'+port+'/';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
async function waitForServer(){
 for(let i=0;i<35;i++){try{const r=await fetch(url);if(r.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,250));}
 throw Error('Local TravelIt server did not start');
}
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true});
const page=await ctx.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await waitForServer();
 await page.goto(url,{waitUntil:'networkidle'});
 await page.locator('[data-view="trips"]').last().click();
 await page.locator('[data-action="new-trip"]').first().click();
 await page.locator('#f-title').fill('Synthetic B2 Trip');
 await page.locator('#f-startDate').fill('2026-12-05');
 await page.locator('#f-endDate').fill('2026-12-07');
 await page.locator('#modal-form button[type=submit]').click();
 await page.locator('.itinerary-table').waitFor();
 assert.equal(await page.locator('.itinerary-table tbody tr').count(),2);
 for(const [i,title,time] of [[0,'Breakfast','08:00'],[1,'Walk on beach','10:00']]){
  const row=page.locator('.itinerary-table tbody tr').nth(i);
  await row.locator('[data-day-field="title"]').fill(title);
  await row.locator('[data-day-field="time"]').fill(time);
 }
 await page.locator('[data-action="save-itinerary-grid"]').click();
 await page.waitForTimeout(500);
 assert.equal(await page.locator('.itinerary-table tr[data-stop-id]:not([data-stop-id=""])').count(),2,'two saved stops');
 await page.locator('[data-view="explore"]').last().click();
 await page.locator('[data-view="explore"]').last().click();
 await page.locator('[data-action="add-place"]').first().click();
 await page.locator('#f-name').fill('Synthetic North Camp Beach');
 await page.locator('#f-sourceUrl').fill('https://example.com/synthetic-beach');
 await page.screenshot({path:'/tmp/travelit-b2-image.png'});
 await page.locator('#place-cover-file').setInputFiles('/tmp/travelit-b2-image.png');
 await page.locator('#modal-form button[type=submit]').click();
 await page.locator('.story-cover img').first().waitFor({timeout:12000});
 await page.locator('[data-view="photos"]').last().click();
 assert.equal(await page.locator('.photo-story img').count(),1);
 await page.reload({waitUntil:'networkidle'});
 await page.locator('[data-view="trips"]').last().click();
 assert.equal(await page.locator('.itinerary-table tr[data-stop-id]:not([data-stop-id=""])').count(),2,'persistent stops');
 await page.locator('[data-view="more"]').last().click();
 const downloadPromise=page.waitForEvent('download');
 await page.locator('[data-action="export-backup"]').first().click();
 const download=await downloadPromise;
 const bytes=readFileSync(await download.path());
 const backup=JSON.parse(bytes.toString('utf8'));
 assert.equal(backup.schemaVersion,6);
 assert.equal(backup.records.filter(x=>x.type==='stop').length,2);
 assert.equal(backup.records.filter(x=>x.type==='place').length,1);
 assert.ok(backup.records.find(x=>x.type==='place').data.coverImage.startsWith('data:image/jpeg;base64,'));
 assert.equal(errors.length,0,'uncaught browser exceptions: '+errors.join('; '));
 console.log('B2_BROWSER_PASS: grid, photos, local cover, reload persistence and backup');
}finally{await ctx.close();await browser.close();server.kill();}
