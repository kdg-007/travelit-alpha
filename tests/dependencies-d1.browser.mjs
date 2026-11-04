import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
const port=8597,url='http://127.0.0.1:'+port+'/';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
async function ready(){for(let i=0;i<45;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw Error('Local server unavailable');}
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true});
const page=await context.newPage(),faults=[];
page.on('pageerror',e=>faults.push(e.message));
async function add(title,time,duration,predecessor=null,lag=0,fixed=false){
 await page.locator('[data-action="add-stop"]').first().click();
 await page.locator('#f-title').fill(title);
 await page.locator('#f-time').fill(time);
 await page.locator('#f-durationMinutes').fill(String(duration));
 if(predecessor)await page.locator('#f-predecessorId').selectOption({label:predecessor});
 if(lag)await page.locator('#f-lagMinutes').fill(String(lag));
 if(fixed)await page.locator('input[name=fixed]').check();
 await page.locator('#modal-form button[type=submit]').click();
}
try{
 await ready();await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.locator('[data-view="trips"]').last().click();
 await page.locator('[data-action="new-trip"]').first().click();
 await page.locator('#f-title').fill('Cagayan Test Journey');
 await page.locator('#f-startDate').fill('2026-12-05');
 await page.locator('#f-endDate').fill('2026-12-09');
 await page.locator('#modal-form button[type=submit]').click();
 await add('Morning drive','08:00',120);
 await add('Lunch','09:00',60,'Morning drive · 2026-12-05',30);
 await page.locator('.schedule-conflicts').getByText('linked activities need attention').waitFor();
 await page.locator('[data-action="schedule-reflow"]').first().click();
 await page.getByText('1 activities will move').waitFor();
 await page.getByText('2026-12-05 10:30').waitFor();
 await page.locator('#modal-form button[type=submit]').click();
 await page.locator('.schedule-conflicts').waitFor({state:'detached'});
 await page.locator('[data-action="itinerary-mode:table"]').click();
 await page.locator('[data-day-field="title"]').first().waitFor();
 const row=page.locator('.itinerary-table tbody tr').filter({has:page.locator('[data-day-field="title"][value="Lunch"]')});
 assert.equal(await row.count(),1);
 assert.equal(await row.locator('[data-day-field="time"]').inputValue(),'10:30');
 await page.locator('[data-view="more"]').last().click();
 const download=page.waitForEvent('download');await page.locator('[data-action="export-backup"]').first().click();
 const file=await download;const data=JSON.parse(readFileSync(await file.path(),'utf8'));
 const lunch=data.records.find(r=>r.type==='stop'&&r.data.title==='Lunch')?.data;
 assert.ok(lunch?.predecessorId);
 assert.equal(lunch.time,'10:30');
 assert.equal(lunch.lagMinutes,30);
 assert.equal(faults.length,0,faults.join('; '));
 console.log('D1_BROWSER_PASS: predecessor entry, reflow preview/confirmation, table and backup consistency');
}finally{await context.close();await browser.close();server.kill();}
