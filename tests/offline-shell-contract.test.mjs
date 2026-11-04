import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SHELL_CACHE_NAME,SHELL_ASSETS,verifyOfflineShell} from '../js/offline-shell.js';

const source=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const header=/const CACHE='([^']+)';const SHELL=(\[[^\n]*\]);/.exec(source);

test('offline diagnosis uses the exact active service-worker cache and assets',()=>{
  assert.ok(header,'Service-worker cache declaration must be parseable');
  assert.equal(SHELL_CACHE_NAME,header[1],'Offline checker cache revision drifted from service worker');
  assert.deepEqual(SHELL_ASSETS,JSON.parse(header[2]),'Offline checker asset list drifted from service worker');
});

function fakeCache(missing=null){
  const scope='https://example.test/travelit-alpha/';
  const known=new Set(SHELL_ASSETS.map(path=>new URL(path,scope).href));
  if(missing)known.delete(new URL(missing,scope).href);
  const cacheStorage={
    keys:async()=>[SHELL_CACHE_NAME],
    open:async()=>({match:async url=>known.has(url)?{ok:true}:undefined})
  };
  const serviceWorker={controller:{},getRegistration:async()=>({scope})};
  return {scope,cacheStorage,serviceWorker};
}

test('installed and controlled current shell is recognized as offline-ready',async()=>{
  const result=await verifyOfflineShell(fakeCache());
  assert.equal(result.ready,true,result.reason);
  assert.equal(result.cached,SHELL_ASSETS.length);
  assert.deepEqual(result.missing,[]);
});

test('missing a feature module fails closed without changing any cache',async()=>{
  assert.ok(SHELL_ASSETS.includes('./js/media-preview.js'));
  const result=await verifyOfflineShell(fakeCache('./js/media-preview.js'));
  assert.equal(result.ready,false);
  assert.ok(result.missing.includes('./js/media-preview.js'));
});

test('shell response without a controlling worker is not falsely called ready',async()=>{
  const fixture=fakeCache();
  fixture.serviceWorker.controller=null;
  const result=await verifyOfflineShell(fixture);
  assert.equal(result.ready,false);
  assert.match(result.reason,/does not control/i);
});
