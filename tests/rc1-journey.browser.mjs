import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {verifyBackup} from '../js/backup.js';

const port=8627,url='http://127.0.0.1:'+port+'/';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
const browser=await chromium.launch({headless:true});
const mkContext=()=>browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,acceptDownloads:true});
let first=null,second=null;
async function waitForServer(){
 for(let i=0;i<45;i++){
  try{if((await fetch(url)).ok)return;}catch{}
  await new Promise(r=>setTimeout(r,250));
 }
 throw Error('TravelIt local server did not become available.');
}
const errors=[];
function track(page,label){page.on('pageerror',e=>errors.push(label+': '+e.message));}

try{
 await waitForServer();
 first=await mkContext();const page=await first.newPage();track(page,'source');
 await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.locator('[data-view="trips"]').last().click();
 await page.locator('[data-action="new-trip"]').first().click();
 await page.locator('#f-title').fill('RC1 Family Weekend');
 await page.locator('#f-startDate').fill('2026-12-05');
 await page.locator('#f-endDate').fill('2026-12-07');
 await page.locator('#modal-form button[type=submit]').click();
 await page.locator('[data-action="add-stop"]').first().click();
 await page.locator('#f-title').fill('Morning road trip');
 await page.locator('#f-time').fill('08:00');
 await page.locator('#f-durationMinutes').fill('90');
 await page.locator('#modal-form button[type=submit]').click();
 await page.locator('.timeline-bar').first().waitFor();
 
 await page.locator('[data-trip-tab="packing"]').click();
 await page.locator('[data-action="packing-mindmap"]').click();
 await page.locator('#packing-tree').waitFor();
 await page.locator('[data-pack-tree-add-branch]').click();
 const branch=page.locator('[data-pack-tree-branch]').last();
 await branch.locator('[data-pack-tree-group]').fill('RC1 essentials');
 await branch.locator('[data-pack-tree-item]').first().fill('Reusable water');
 await page.locator('#modal-form button[type=submit]').click();
 await page.getByText('Reusable water').first().waitFor();
 
 await page.locator('[data-trip-tab="info"]').click();
 await page.locator('[data-action^="add-note:trip:"]').first().click();
 await page.locator('#f-title').fill('RC1 trip notes');
 await page.locator('#f-content').fill('# Weekend\n- Check sunrise timing');
 await page.locator('#note-save-status').getByText('Saved on this device').waitFor({timeout:15000});
 await page.locator('#modal-form button[type=submit]').click();
 await page.getByText('RC1 trip notes').first().waitFor();
 
 await page.locator('[data-view="explore"]').last().click();
 await page.locator('[data-action="add-place"]').first().click();
 await page.locator('#f-name').fill('RC1 saved destination');
 await page.locator('#f-sourceUrl').fill('https://example.com/rc1-place');
 await page.locator('#modal-form button[type=submit]').click();
 await page.getByText('RC1 saved destination').first().waitFor();
 
 await page.locator('[data-view="photos"]').last().click();
 await page.locator('[data-action="photo-add"]').first().click();
 const photo=await page.screenshot({type:'png'});
 await page.locator('#f-photos').setInputFiles({name:'RC1 Family Scene.png',mimeType:'image/png',buffer:photo});
 await page.locator('#f-photoDate').fill('2026-12-06');
 await page.locator('#modal-form button[type=submit]').click();
 await page.locator('.editorial-photo-grid .photo-story').first().waitFor();
 
 await page.locator('[data-view="more"]').last().click();
 const downloadPromise=page.waitForEvent('download');
 await page.locator('[data-action="export-backup"]').first().click();
 const download=await downloadPromise;
 const backupFile=await download.path();
 const backup=JSON.parse(readFileSync(backupFile,'utf8'));
 assert.equal(backup.schemaVersion,7);
 assert.equal((await verifyBackup(backup)).legacy,false);
 const byType=new Map();
 for(const row of backup.records)byType.set(row.type,[...(byType.get(row.type)||[]),row.data]);
 for(const type of ['trip','stop','packing','note','place','photo'])assert.ok(byType.get(type)?.length>0,'Missing record type '+type);
 const trip=byType.get('trip').find(row=>row.title==='RC1 Family Weekend');
 assert.ok(trip);
 assert.ok(byType.get('stop').some(row=>row.tripId===trip.id&&row.title==='Morning road trip'));
 assert.ok(byType.get('packing').some(row=>row.tripId===trip.id&&row.label==='Reusable water'));
 assert.ok(byType.get('note').some(row=>row.targetType==='trip'&&row.targetId===trip.id&&row.title==='RC1 trip notes'));
 assert.ok(byType.get('photo')[0].image.startsWith('data:image/jpeg;base64,'));
 assert.equal(errors.length,0,errors.join('; '));
 
 second=await mkContext();const restored=await second.newPage();track(restored,'restored');
 restored.on('dialog',async d=>d.accept());
 await restored.goto(url,{waitUntil:'domcontentloaded'});
 await restored.locator('[data-view="more"]').last().click();
 await restored.locator('[data-action="import-backup"]').first().click();
 await restored.locator('#restore-file').setInputFiles(backupFile);
 await restored.locator('#modal-form button[type=submit]').click();
 await restored.getByText('RC1 trip notes').first().waitFor({timeout:15000});
 await restored.locator('[data-view="photos"]').last().click();
 await restored.locator('.editorial-photo-grid .photo-story').first().waitFor();
 await restored.locator('[data-view="trips"]').last().click();
 await restored.getByText('RC1 Family Weekend').first().waitFor();
 await restored.locator('[data-trip-tab="packing"]').click();
 await restored.getByText('Reusable water').first().waitFor();
 await restored.locator('[data-trip-tab="info"]').click();
 await restored.getByText('RC1 trip notes').first().waitFor();
 await restored.locator('[data-action^="edit-note:"]').first().click();
 assert.equal(await restored.locator('#f-content').inputValue(),'# Weekend\n- Check sunrise timing');
 assert.equal(errors.length,0,errors.join('; '));
 const pageWidth=await restored.evaluate(()=>({viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
 assert.ok(pageWidth.scroll<=pageWidth.viewport+3,'Mobile overflow '+JSON.stringify(pageWidth));
 console.log('RC1_JOURNEY_PASS: trip, timeline, checklist, note, place and photo survive one verified backup and clean-device restore');
}finally{
 if(first)await first.close();
 if(second)await second.close();
 await browser.close();server.kill();
}
