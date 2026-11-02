import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
const port=8564,base='http://127.0.0.1:'+port+'/';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
async function wait(){for(let i=0;i<30;i++){try{let r=await fetch(base);if(r.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,250));}throw Error('Local test server unavailable');}
const browser=await chromium.launch({headless:true});
try{
 await wait();
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base,{waitUntil:'networkidle'});
 async function visibleInside(name){const measure=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,topbar:document.querySelector('.topbar').getBoundingClientRect().right}));assert.ok(measure.width<=measure.viewport+2,`${name}: page overflows: ${JSON.stringify(measure)}`);assert.ok(measure.topbar<=measure.viewport+2,`${name}: header offscreen`);}
 await visibleInside('Explore');
 assert.equal(await page.getByText('Somewhere next.').count(),0);
 assert.equal(await page.getByText('Saved places').count(),1);
 await page.locator('[data-view="photos"]').last().click();await visibleInside('Photos');
 assert.equal(await page.getByText('No photos yet').count(),1);
 assert.equal(await page.getByText('A gallery in the making.').count(),0);
 await page.locator('[data-view="more"]').last().click();await visibleInside('My Library');
 assert.equal(await page.getByText('Secure document storage will become available').count(),0);
 assert.equal(await page.getByText('Export',{exact:true}).count(),1);
 await page.locator('[data-view="today"]').last().click();await visibleInside('Today');
 assert.equal(await page.getByText('No trip scheduled').count(),1);
 await page.locator('[data-view="trips"]').last().click();await page.locator('[data-action="new-trip"]').first().click();
 await page.locator('#f-title').fill('B3 QA weekend');await page.locator('#f-startDate').fill('2026-12-05');await page.locator('#f-endDate').fill('2026-12-07');
 await page.locator('#modal-form button[type=submit]').click();await page.locator('.itinerary-table').waitFor();await visibleInside('Itinerary');
 const rects=await page.evaluate(()=>{const row=document.querySelector('.itinerary-table tbody tr');return Object.fromEntries(['time','title','durationMinutes'].map(f=>{const b=row.querySelector('[data-day-field="'+f+'"]').getBoundingClientRect();return [f,{left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width}]}))});
 assert.ok(rects.time.width>=90&&rects.title.width>=150,JSON.stringify(rects));
 assert.ok(rects.title.bottom <= rects.time.top,`Overlapping itinerary controls ${JSON.stringify(rects)}`);
 await page.locator('.itinerary-table [data-day-field="title"]').first().fill('Breakfast');
 await page.locator('.itinerary-table [data-day-field="time"]').first().fill('08:00');
 await page.locator('[data-action="save-itinerary-grid"]').click();
 assert.equal(errors.length,0,errors.join('; '));
 console.log('B3_BROWSER_PASS: responsive width, concise content, photos, library, itinerary save and no overlapping fields');
 await context.close();
} finally {await browser.close();server.kill();}
