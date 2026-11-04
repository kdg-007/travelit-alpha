/* Codespaces-only convenience: keep an isolated disposable preview reachable
 * whenever a VS Code browser session attaches to the container.
 * Cannot keep a stopped/suspended Codespace awake; not a stable hosting service.
 */
import {spawn} from 'node:child_process';
import {openSync,closeSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const script=fileURLToPath(new URL('./serve-rc1-preview.mjs',import.meta.url));
const defaultLog=join(tmpdir(),'travelit-rc1-preview.log');
const pause=ms=>new Promise(done=>setTimeout(done,ms));

async function probe(port){
 try{
  const response=await fetch('http://127.0.0.1:'+port+'/',{signal:AbortSignal.timeout(650)});
  const page=(await response.text()).slice(0,16000);
  return response.ok&&page.includes('RC1 PREVIEW · TEST DATA ONLY')?'preview':'other';
 }catch{return 'offline';}
}
export async function ensureRc1Preview({port=8000,logFile=defaultLog}={}){
 if(!Number.isSafeInteger(port)||port<1||port>65535)throw Error('Valid TCP port required');
 const first=await probe(port);
 if(first==='preview')return {status:'already-running',port,pid:null};
 if(first==='other')throw Error('Port '+port+' is owned by another service; refusing to replace it.');
 const fd=openSync(logFile,'a');
 let child;
 try{
  child=spawn(process.execPath,[script],{
   cwd:root,env:{...process.env,PORT:String(port)},stdio:['ignore',fd,fd],detached:true
  });
 }finally{closeSync(fd);}
 child.unref();
 for(let attempt=0;attempt<35;attempt++){
  await pause(160);
  const state=await probe(port);
  if(state==='preview')return {status:'started',port,pid:child.pid};
  if(state==='other')throw Error('Port '+port+' was claimed by a different service during start.');
  if(child.exitCode!==null)break;
 }
 const log=readFileSync(logFile,'utf8').slice(-2000);
 throw Error('RC1 preview failed to start; see '+logFile+': '+log);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const result=await ensureRc1Preview({port:Number(process.env.PORT||8000)});
  process.stdout.write('TravelIt RC1 preview '+result.status+' on port '+result.port+'\n');
 }catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
}
