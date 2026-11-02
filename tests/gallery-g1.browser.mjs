import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
const port=8613,url='http://127.0.0.1:'+port+'/';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
async function ready(){for(let i=0;i<45;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw Error('Test server unavailable');}
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true});
let freshContext=null;
const page=await context.newPage(),faults=[];
page.on('pageerror',err=>faults.push(err.message));
async function widthCheck(p){
 const width=await p.evaluate(()=>({screen:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
 assert.ok(width.scroll<=width.screen+3,'Unexpected mobile horizontal overflow: '+JSON.stringify(width));
}
try{
 await ready();await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.locator('[data-view="today"]').last().click();
 await page.getByText('No trip scheduled').waitFor();
 await widthCheck(page);
 await page.locator('[data-view="trips"]').last().click();
 await page.locator('[data-action="new-trip"]').first().click();
 await page.locator('#f-title').fill('Cagayan Valley');
 await page.locator('#f-startDate').fill('2026-12-05');
 await page.locator('#f-endDate').fill('2026-12-09');
 await page.locator('#modal-form button[type=submit]').click();
 await page.locator('[data-view="photos"]').last().click();
 await page.locator('[data-action="photo-add"]').first().click();
 const picture=await page.screenshot({type:'png'});
 await page.locator('#f-photos').setInputFiles([
  {name:'Sunrise.png',mimeType:'image/png',buffer:picture},
  {name:'CampTrail.png',mimeType:'image/png',buffer:picture}
 ]);
 await page.locator('#f-photoDate').fill('2026-12-06');
 await page.locator('#modal-form button[type=submit]').click();
 await page.locator('.editorial-photo-grid .photo-story').first().waitFor();
 assert.equal(await page.locator('.editorial-photo-grid .photo-story').count(),2);
 await widthCheck(page);
 await page.locator('[data-action="photo-open:"]').count().then(x=>assert.equal(x,0));
 await page.locator('[data-action^="photo-open:"]').first().click();
 await page.locator('[data-action^="photo-edit:"]').first().click();
 await page.locator('#f-title').fill('Our mountain morning');
 await page.locator('#f-caption').fill('Sunrise and breakfast at camp');
 await page.locator('#modal-form button[type=submit]').click();
 await page.getByText('Our mountain morning').first().waitFor();
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('[data-view="photos"]').last().click();
 await page.getByText('Our mountain morning').first().waitFor();
 await page.locator('[data-action="photo-filter:places"]').click();
 assert.equal(await page.locator('.editorial-photo-grid .photo-story').count(),0);
 await page.locator('[data-action="photo-filter:all"]').click();
 assert.equal(await page.locator('.editorial-photo-grid .photo-story').count(),2);
 await page.locator('[data-view="more"]').last().click();
 const downloadPromise=page.waitForEvent('download');
 await page.locator('[data-action="export-backup"]').first().click();
 const file=await downloadPromise;
 const path=await file.path(),backup=JSON.parse(readFileSync(path,'utf8'));
 assert.equal(backup.schemaVersion,7);
 const rows=backup.records.filter(x=>x.type==='photo');
 assert.equal(rows.length,2);
 assert.ok(rows.every(x=>x.data.image.startsWith('data:image/jpeg;base64,')));
 assert.equal(rows.find(x=>x.data.title==='Our mountain morning')?.data.caption,'Sunrise and breakfast at camp');
 assert.equal(faults.length,0,'Browser page errors: '+faults.join('; '));
 freshContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true});
 const fresh=await freshContext.newPage(),freshFaults=[];
 fresh.on('pageerror',e=>freshFaults.push(e.message));
 fresh.on('dialog',async d=>d.accept());
 await fresh.goto(url,{waitUntil:'domcontentloaded'});
 await fresh.locator('[data-view="more"]').last().click();
 await fresh.locator('[data-action="import-backup"]').first().click();
 await fresh.locator('#restore-file').setInputFiles(path);
 await fresh.locator('#modal-form button[type=submit]').click();
 await fresh.locator('[data-view="photos"]').last().click();
 await fresh.getByText('Our mountain morning').first().waitFor({timeout:15000});
 assert.equal(await fresh.locator('.editorial-photo-grid .photo-story').count(),2);
 await widthCheck(fresh);
 assert.equal(freshFaults.length,0,freshFaults.join('; '));
 console.log('G1_BROWSER_PASS: editorial mobile layout, two-photo import, metadata editing, reload, verified backup and fresh-workspace restore');
}finally{if(freshContext)await freshContext.close();await context.close();await browser.close();server.kill();}
