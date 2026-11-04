import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
const port=8657,url='http://127.0.0.1:'+port+'/';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
const browser=await chromium.launch({headless:true});
let ctx=null;
async function ready(){for(let i=0;i<50;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,200));}throw Error('Trip navigation test server unavailable.');}
try{
 await ready();
 for(const width of [320,390,1280]){
  ctx=await browser.newContext({viewport:{width,height:844},isMobile:width<700,hasTouch:width<700});
  const page=await ctx.newPage(),faults=[];
  page.on('pageerror',e=>faults.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('[data-view="trips"]:visible').first().click();
  await page.locator('[data-action="new-trip"]:visible').first().click();
  await page.locator('#f-title').fill('Trip A');
  await page.locator('#f-startDate').fill('2026-12-05');
  await page.locator('#f-endDate').fill('2026-12-07');
  await page.locator('#modal-form button[type=submit]').click();
  await page.locator('#modal-backdrop').waitFor({state:'hidden',timeout:15000});
  assert.equal(await page.locator('.trip-workspace h2').count(),1);
  assert.equal(await page.locator('.trip-card').count(),0,'Selected trip is not duplicated in a single-trip card');
  const tabs=page.locator('.trip-workspace [data-trip-tab]');
  assert.equal(await tabs.count(),6,'All six sections must be present');
  const geometry=await tabs.evaluateAll(nodes=>nodes.map(x=>{
    const r=x.getBoundingClientRect(),c=document.documentElement.clientWidth;
    return {name:x.textContent,left:r.left,right:r.right,top:r.top,bottom:r.bottom,viewport:c};
  }));
  for(const tab of geometry)assert.ok(tab.left>=-1&&tab.right<=tab.viewport+1&&tab.bottom>tab.top,'Hidden trip section at width '+width+': '+JSON.stringify(tab));
  if(width<700)assert.ok(new Set(geometry.map(x=>Math.round(x.top))).size===2,'Six trip sections should occupy two fully visible rows on phones');
  for(const value of ['packing','prepare','costs','info','calendar','itinerary']){
   await page.locator('[data-trip-tab="'+value+'"]').click();
   assert.ok((await page.locator('[data-trip-tab="'+value+'"]').getAttribute('class')).includes('active'),'Tab failed '+value);
  }
  await page.locator('[data-action="new-trip"]:visible').first().click();
  await page.locator('#f-title').fill('Trip B');
  await page.locator('#f-startDate').fill('2027-01-06');
  await page.locator('#f-endDate').fill('2027-01-08');
  await page.locator('#modal-form button[type=submit]').click();
  await page.locator('#modal-backdrop').waitFor({state:'hidden',timeout:15000});
  assert.equal(await page.locator('.trip-card').count(),1,'Only the other trip should be shown as a selectable card');
  await page.locator('.trip-card').first().click();
  assert.equal(await page.locator('.trip-workspace h2').textContent(),'Trip A');
  assert.equal(await page.locator('.trip-card').count(),1);
  assert.equal(faults.length,0,faults.join('; '));
  await ctx.close();ctx=null;
 }
 console.log('RC1_TRIP_NAV_PASS: all six sections visible at 320/390/1280, no duplicate selected card, two-trip switch');
}finally{if(ctx)await ctx.close();await browser.close();server.kill();}
