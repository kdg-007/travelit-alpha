import {createHash} from 'node:crypto';
import {existsSync,readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const PREVIEW_MANIFEST='PREVIEW_INTEGRITY.json';
function enumerate(dir,under=''){
 const items=[];
 for(const entry of readdirSync(join(dir,under),{withFileTypes:true})){
  const path=under?under+'/'+entry.name:entry.name;
  if(entry.isSymbolicLink())throw Error('Preview cannot contain symbolic links: '+path);
  if(entry.isDirectory())items.push(...enumerate(dir,path));
  else if(entry.isFile()&&path!==PREVIEW_MANIFEST)items.push(path);
  else if(!entry.isFile())throw Error('Unsupported preview entry: '+path);
 }
 return items.sort();
}
function digest(bytes){return createHash('sha256').update(bytes).digest('hex');}
function snapshot(directory){
 return enumerate(directory).map(path=>{
  const bytes=readFileSync(join(directory,path));
  return {path,bytes:bytes.length,sha256:digest(bytes)};
 });
}
export function sealPreviewDirectory(directory){
 directory=resolve(directory);
 if(!existsSync(directory))throw Error('Preview directory is missing.');
 const manifest={format:'travelit-rc1-preview-integrity-v1',files:snapshot(directory)};
 if(!manifest.files.some(x=>x.path==='js/preview-bootstrap.js'))throw Error('Preview bootstrap absent.');
 writeFileSync(join(directory,PREVIEW_MANIFEST),JSON.stringify(manifest,null,2)+'\n');
 return manifest;
}
export function verifyPreviewDirectory(directory){
 directory=resolve(directory);
 const manifest=JSON.parse(readFileSync(join(directory,PREVIEW_MANIFEST),'utf8'));
 if(manifest.format!=='travelit-rc1-preview-integrity-v1'||!Array.isArray(manifest.files))throw Error('Unsupported preview integrity format.');
 const actual=snapshot(directory);
 if(JSON.stringify(actual)!==JSON.stringify(manifest.files))throw Error('Preview file content or inventory does not match integrity manifest.');
 return {ok:true,files:actual.length,bytes:actual.reduce((sum,f)=>sum+f.bytes,0)};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const dir=resolve(process.argv[2]||'artifacts/rc1-preview');
 const outcome=verifyPreviewDirectory(dir);
 process.stdout.write('RC1_PREVIEW_INTEGRITY_PASS: '+outcome.files+' files verified ('+outcome.bytes+' bytes)\n');
}
