import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
const port=8621,url='http://127.0.0.1:'+port+'/';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
async function ready(){for(let i=0;i<40;i++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw Error('Test server not ready');}
const browser=await chromium.launch({headless:true});
const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true});
const page=await ctx.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('https://i.ytimg.com/**',route=>route.abort('failed'));
async function newPlace(name,link){
 await page.locator('[data-action="add-place"]').first().click();
 if(name)await page.locator('#f-name').fill(name);
 await page.locator('#f-sourceUrl').fill(link);
 await page.locator('#f-sourceUrl').press('Tab');
 if(!name)assert.equal(await page.locator('#f-name').inputValue(),'YouTube video');
 await page.locator('#modal-form button[type=submit]').click();
}
async function widthCheck(){
 const dimensions=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
 assert.ok(dimensions.scroll<=dimensions.width+3,'Unexpected horizontal overflow: '+JSON.stringify(dimensions));
}
try{
 await ready();await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.locator('[data-action="add-place"]').first().waitFor();
 await newPlace('', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
 const youtube=page.locator('.editorial-story-card').filter({hasText:'YouTube video'});
 await youtube.waitFor();
 assert.match(await youtube.locator('img[data-media-remote]').getAttribute('src'),/i\.ytimg\.com\/vi\/dQw4w9WgXcQ\/hqdefault\.jpg/);
 await youtube.locator('.cover-category').waitFor({state:'visible'});
 assert.equal(await youtube.locator('.media-kind-pill').innerText(),'Video');
 assert.ok((await youtube.innerText()).includes('Watch'));
 await newPlace('Mt Pulag sunrise reel','https://www.facebook.com/reel/123987');
 const facebook=page.locator('.editorial-story-card').filter({hasText:'Mt Pulag sunrise reel'});
 await facebook.waitFor();
 assert.equal(await facebook.locator('img').count(),0,'No invented Facebook video image');
 assert.equal(await facebook.locator('.media-kind-pill').innerText(),'Video');
 const screenshot=await page.screenshot({type:'png'});
 await facebook.locator('input[data-place-cover-id]').setInputFiles({name:'reel-screenshot.png',mimeType:'image/png',buffer:screenshot});
 await page.locator('.explore-feature-photo img').waitFor({timeout:15000});
 await widthCheck();
 await page.setViewportSize({width:320,height:750});
 await widthCheck();
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('.explore-feature-photo img').waitFor();
 assert.match(await page.locator('.explore-feature-photo img').getAttribute('src'),/^data:image\/jpeg;base64,/);
 await page.locator('[data-view="more"]').last().click();
 const download=page.waitForEvent('download');
 await page.locator('[data-action="export-backup"]').first().click();
 const archive=await download;
 const backup=JSON.parse(readFileSync(await archive.path(),'utf8'));
 const facebookRecord=backup.records.find(x=>x.type==='place'&&x.data.name==='Mt Pulag sunrise reel')?.data;
 assert.ok(facebookRecord?.coverImage.startsWith('data:image/jpeg;base64,'));
 assert.ok(!facebookRecord.remoteThumbnail);
 const youtubeRecord=backup.records.find(x=>x.type==='place'&&x.data.name==='YouTube video')?.data;
 assert.equal(youtubeRecord.coverImage,'');
 assert.ok(!youtubeRecord.remoteThumbnail);
 assert.equal(errors.length,0,'Browser errors: '+errors.join('; '));
 console.log('V1_BROWSER_PASS: YouTube preview fallback, real Facebook screenshot cover, iPhone widths, reopen and backup');
}finally{await ctx.close();await browser.close();server.kill();}
