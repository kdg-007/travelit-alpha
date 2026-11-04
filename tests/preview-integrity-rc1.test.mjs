import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,appendFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildRc1Preview} from '../scripts/build-rc1-preview.mjs';
import {sealPreviewDirectory,verifyPreviewDirectory,PREVIEW_MANIFEST} from '../scripts/preview-integrity.mjs';

test('built RC1 preview is sealed and rejects altered or injected files',()=>{
 const dir=mkdtempSync(join(tmpdir(),'travelit-preview-integrity-'));
 const outputDir=join(dir,'preview');
 try{
  buildRc1Preview({rootDir:fileURLToPath(new URL('../',import.meta.url)),outputDir});
  const manifest=JSON.parse(readFileSync(join(outputDir,PREVIEW_MANIFEST),'utf8'));
  assert.equal(manifest.format,'travelit-rc1-preview-integrity-v1');
  assert.ok(manifest.files.some(x=>x.path==='js/db.js'));
  assert.ok(manifest.files.some(x=>x.path==='js/preview-bootstrap.js'));
  assert.ok(manifest.files.some(x=>x.path==='sw.js'));
  assert.equal(verifyPreviewDirectory(outputDir).ok,true);
  appendFileSync(join(outputDir,'js/db.js'),'\n// unexpected change');
  assert.throws(()=>verifyPreviewDirectory(outputDir),/does not match/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('preview refuses production origin and insecure public HTTP, but allows local smoke tests',()=>{
 const src=readFileSync(new URL('../scripts/build-rc1-preview.mjs',import.meta.url),'utf8');
 assert.match(src,/host==='kdg-007\.github\.io'/);
 assert.match(src,/location\.protocol!=='https:'&&!local/);
 assert.match(src,/sealPreviewDirectory\(outputDir\)/);
});
