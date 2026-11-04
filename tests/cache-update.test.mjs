import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');

test('versioned main assets bypass a previously installed cache-first worker',()=>{
 const script=/src="(js\/app\.js\?v=[a-z0-9-]+)"/.exec(html);
 const style=/href="(css\/style\.css\?v=[a-z0-9-]+)"/.exec(html);
 assert.ok(script,'JS has an explicit release URL');
 assert.ok(style,'CSS has an explicit release URL');
 assert.match(sw,new RegExp(script[1].replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&')));
 assert.match(sw,new RegExp(style[1].replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&')));
});
test('new worker finishes precaching before taking control',()=>{
 assert.match(sw,/c\.addAll\(SHELL\.map\(path=>new Request\(path,\{cache:'reload'\}\)\)\)/);
 assert.match(sw,/\.then\(\(\)=>self\.skipWaiting\(\)\)/);
 assert.match(sw,/await self\.clients\.claim\(\)/);
});
test('worker update does not clear IndexedDB or delete personal browser storage',()=>{
 assert.doesNotMatch(sw,/indexedDB\.deleteDatabase|localStorage\.clear|caches\.delete\(CACHE\)/);
});
test('the updated app still contains the intended B1 Photos navigation',()=>{
 assert.match(app,/\['photos','Photos'/);
 assert.doesNotMatch(app,/\['packing','Packing','✓'/);
});

test('new cache refuses stale module responses from browser HTTP cache',()=>{
 assert.match(sw,/new Request\(path,\{cache:'reload'\}\)/);
});
