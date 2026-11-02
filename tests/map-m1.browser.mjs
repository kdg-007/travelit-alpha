import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
const port=8577,url='http://127.0.0.1:'+port+'/';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
async function ready(){for(let i=0;i<40;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw Error('Test server did not start');}
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
async function savePlace(name,lat,lng){
 await page.locator('[data-action="add-place"]').first().click();
 await page.locator('#f-name').fill(name);
 await page.locator('#f-lat').locator('xpath=ancestor::details').locator('summary').click();
 await page.locator('#f-lat').fill(lat);
 await page.locator('#f-lng').fill(lng);
 await page.locator('#modal-form button[type=submit]').click();
}
try{
 await ready();
 await page.goto(url,{waitUntil:'domcontentloaded'});
 await savePlace('North Camp Beach','17.6','121.7');
 await savePlace('Hotel Two','17.7','121.8');
 await page.locator('[data-action="show-map"]').first().click();
 await page.locator('#travelit-live-map').waitFor();
 assert.equal(await page.locator('.travelit-map-place').count(),2);
 assert.equal(await page.locator('[data-action^="live-map-focus:"]').count(),2);
 assert.equal(await page.locator('[data-action="live-map-pick"]').isVisible(),true);
 // A working interactive map must paint a MapLibre canvas, not merely an empty container.
 await page.locator('#travelit-live-map .maplibregl-canvas').waitFor({timeout:25000});
 assert.equal(await page.locator('.map-advanced').getAttribute('open'),null,'technical map tools must start closed');
 assert.equal(errors.length,0,'Unhandled page errors: '+errors.join('; '));
 console.log('M1_BROWSER_PASS: saved multi-pin list, map container, pin controls, advanced tools concealed');
}finally{await context.close();await browser.close();server.kill();}
