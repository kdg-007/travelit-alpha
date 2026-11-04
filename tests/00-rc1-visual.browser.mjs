import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdirSync} from 'node:fs';

const port=8653,base='http://127.0.0.1:'+port+'/';
const dir='artifacts/visual';
mkdirSync(dir,{recursive:true});
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
const browser=await chromium.launch({headless:true});
async function ready(){
 for(let i=0;i<45;i++){
  try{if((await fetch(base)).ok)return;}catch{}
  await new Promise(r=>setTimeout(r,250));
 }
 throw Error('RC1 visual inspection server unavailable');
}
function fileName(value){return value.replace(/[^a-z0-9-]/gi,'-').toLowerCase();}
async function screen(page,preset,name){
 const metrics=await page.evaluate(()=>({
  client:document.documentElement.clientWidth,
  scroll:document.documentElement.scrollWidth,
  topbarRight:document.querySelector('.topbar')?.getBoundingClientRect().right
 }));
 assert.ok(metrics.scroll<=metrics.client+3,preset+' '+name+': horizontal overflow '+JSON.stringify(metrics));
 assert.ok(metrics.topbarRight<=metrics.client+3,preset+' '+name+': topbar overflow '+JSON.stringify(metrics));
 await page.screenshot({path:dir+'/'+fileName(preset)+'-'+fileName(name)+'.png',fullPage:true});
}
async function nav(page,view){await page.locator('[data-view="'+view+'"]:visible').first().click();}
let contexts=[];
try{
 await ready();
 for(const [preset,width,height] of [['phone-390',390,844],['phone-320',320,700],['desktop-1280',1280,800]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,deviceScaleFactor:width<700?2:1});
  contexts.push(context);
  const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.locator('#main').waitFor();
  await screen(page,preset,'explore-empty');
  await nav(page,'today');await screen(page,preset,'today-empty');
  await nav(page,'photos');await screen(page,preset,'photos-empty');
  await nav(page,'trips');await screen(page,preset,'trips-empty');
  await page.locator('[data-action="new-trip"]:visible').first().click();
  await page.locator('#f-title').fill('Visual QA Weekend');
  await page.locator('#f-startDate').fill('2026-12-05');
  await page.locator('#f-endDate').fill('2026-12-07');
  await page.locator('#modal-form button[type=submit]').click();
  await page.locator('#modal-backdrop').waitFor({state:'hidden',timeout:15000});
  await page.locator('.trip-workspace').waitFor();
  await screen(page,preset,'trip-itinerary');
  assert.equal(await page.locator('.timeline-axis').count(),0,'Empty days should not display a cropped time ruler');
  for(const [title,time] of [['Early breakfast','07:00'],['Evening arrival','20:00']]){
   await page.locator('[data-action="add-stop"]:visible').first().click();
   await page.locator('#f-title').fill(title);
   await page.locator('#f-time').fill(time);
   await page.locator('#f-durationMinutes').fill('45');
   await page.locator('#modal-form button[type=submit]').click();
   await page.locator('#modal-backdrop').waitFor({state:'hidden',timeout:15000});
  }
  await page.locator('.timeline-bar').first().waitFor();
  const ticks=await page.locator('.timeline-tick').evaluateAll(nodes=>nodes.map(n=>{
   const r=n.getBoundingClientRect();return {left:r.left,right:r.right,label:n.textContent};
  }));
  for(let i=1;i<ticks.length;i++)assert.ok(ticks[i].left>=ticks[i-1].right-1,preset+': overlap '+JSON.stringify(ticks));
  await screen(page,preset,'trip-timeline-populated');
  await page.locator('[data-trip-tab="packing"]:visible').first().click();
  await screen(page,preset,'trip-packing');
  assert.equal(errors.length,0,preset+': '+errors.join('; '));
  await context.close();contexts=contexts.filter(x=>x!==context);
 }
 console.log('RC1_VISUAL_PASS: synthetic Explore, Today, Photos, Trips, itinerary and packing; 320/390/1280px layout screenshots, no horizontal overflow');
}finally{
 for(const context of contexts)await context.close().catch(()=>{});
 await browser.close();
 server.kill();
}
