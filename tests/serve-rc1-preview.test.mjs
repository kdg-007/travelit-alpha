import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildRc1Preview} from '../scripts/build-rc1-preview.mjs';
import {createPreviewServer} from '../scripts/serve-rc1-preview.mjs';

test('temporary HTTPS-tunnel server exposes only sealed preview, proper MIME, no repo source',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'travelit-preview-serve-'));
 let server;
 try{
  const preview=buildRc1Preview({rootDir:fileURLToPath(new URL('../',import.meta.url)),outputDir:join(dir,'preview')});
  server=createPreviewServer({directory:preview.outputDir,port:0});
  if(!server.listening)await new Promise(resolve=>server.once('listening',resolve));
  const url='http://127.0.0.1:'+server.address().port+'/';
  const [home,qa,script,svg,missing,source,post]=await Promise.all([
   fetch(url),fetch(url+'qa.html'),fetch(url+'js/preview-readiness.js'),
   fetch(url+'icons/icon.svg'),fetch(url+'not-here'),fetch(url+'.git/config'),fetch(url,{method:'POST'})
  ]);
  assert.equal(home.status,200);
  assert.match(home.headers.get('content-type'),/^text\/html/);
  assert.equal(home.headers.get('cache-control'),'no-store');
  assert.match(await home.text(),/RC1 PREVIEW · TEST DATA ONLY/);
  assert.equal(qa.status,200);assert.match(await qa.text(),/iPhone acceptance checklist/);
  assert.equal(script.status,200);assert.match(script.headers.get('content-type'),/^text\/javascript/);
  assert.equal(svg.status,200);assert.match(svg.headers.get('content-type'),/^image\/svg\+xml/);
  assert.equal(missing.status,404);assert.equal(source.status,404);assert.equal(post.status,405);
  assert.equal((await fetch(url+'PREVIEW_INTEGRITY.json')).status,200);
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  rmSync(dir,{recursive:true,force:true});
 }
});
test('temporary preview host fails closed without integrity metadata',()=>{
 const dir=mkdtempSync(join(tmpdir(),'travelit-preview-unsafe-'));
 try{
  writeFileSync(join(dir,'index.html'),'unsealed');
  assert.throws(()=>createPreviewServer({directory:dir,port:0}));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
