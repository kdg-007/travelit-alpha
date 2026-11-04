import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {createServer as createHttpServer} from 'node:http';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ensureRc1Preview} from '../scripts/ensure-rc1-preview.mjs';

async function freePort(){
 const s=createServer();
 await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));
 const port=s.address().port;
 await new Promise(resolve=>s.close(resolve));
 return port;
}
test('Codespaces attach starts disposable server once, then reuses it without taking ownership of user data',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'travelit-rc1-restart-'));
 const port=await freePort();
 let pid;
 try{
  const first=await ensureRc1Preview({port,logFile:join(dir,'server.log')});
  assert.equal(first.status,'started');
  assert.ok(Number.isSafeInteger(first.pid));
  pid=first.pid;
  const next=await ensureRc1Preview({port,logFile:join(dir,'server.log')});
  assert.equal(next.status,'already-running');
  assert.equal(next.pid,null,'Must not spawn duplicate server');
  const response=await fetch('http://127.0.0.1:'+port+'/qa.html');
  assert.equal(response.status,200);
  assert.match(await response.text(),/iPhone acceptance checklist/);
 }finally{
  if(pid)try{process.kill(pid,'SIGTERM');}catch{}
  rmSync(dir,{force:true,recursive:true});
 }
});
test('Codespaces attach never replaces another application on the expected port',async()=>{
 const port=await freePort();
 const other=createHttpServer((req,res)=>{res.writeHead(200,{'Connection':'close'});res.end('other');});
 await new Promise(resolve=>other.listen(port,'127.0.0.1',resolve));
 try{
  await assert.rejects(()=>ensureRc1Preview({port}),/owned by another service/);
 }finally{
  other.closeAllConnections();
  await new Promise(resolve=>other.close(resolve));
 }
});
