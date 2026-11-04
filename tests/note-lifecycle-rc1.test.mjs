import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const start=source.indexOf('async function noteEditor(');
const end=source.indexOf('function tripEditor(',start);
const editor=source.slice(start,end);
test('note formatting handlers are owned by the disposable editor form',()=>{
 assert.ok(start>0&&end>start);
 assert.match(editor,/form\.addEventListener\('click',e=>/);
 assert.doesNotMatch(editor,/\$\('#modal-body'\)\.addEventListener\('click'/);
});
test('a late note autosave cannot reach a newly opened modal or reset its dirty flag',()=>{
 assert.match(editor,/editorForm\?\.querySelector\('#f-content'\)/);
 assert.match(editor,/editorForm\?\.isConnected/);
 assert.match(editor,/document\.querySelector\('#modal-form'\)!==editorForm/);
 assert.match(editor,/if\(editorForm\?\.isConnected && document\.querySelector\('#modal-form'\)===editorForm\)/);
});
test('note editor app JS is cache-busted as part of this PWA release',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 const asset=/src="(js\/app\.js\?v=[a-z0-9-]+)"/.exec(html)?.[1];
  assert.ok(asset,'App script must have an explicit versioned URL');
 assert.ok(html.includes(asset));
 assert.ok(sw.includes('./'+asset));
});
