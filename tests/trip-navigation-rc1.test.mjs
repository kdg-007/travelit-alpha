import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../css/style.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
test('mobile trip sections have a non-scrolling 3x2 layout',()=>{
 assert.match(css,/\.trip-workspace \.view-tabs\{\s*display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css,/\.trip-workspace \.view-tabs button\{/);
 assert.match(css,/white-space:normal/);
});
test('selected trip is not duplicated in the journey-card list',()=>{
 assert.match(app,/state\.trips\.filter\(v=>v\.id!==t\?\.id\)/);
 assert.match(app,/state\.trips\.length\?\(cards\?/);
});
