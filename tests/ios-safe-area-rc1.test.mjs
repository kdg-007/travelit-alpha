import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../css/style.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const worker=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
test('standalone iPhone status-bar paint uses the real OS inset and does not cover header',()=>{
  assert.match(css,/@media\(max-width:720px\)\{body::before\{[^}]*height:env\(safe-area-inset-top,0px\)/);
  assert.doesNotMatch(css,/height:max\(env\(safe-area-inset-top,0px\),54px\)/);
  assert.match(css,/@media\(max-width:720px\) and \(display-mode:standalone\)\{\s*\.topbar\{padding-top:calc\(9px \+ env\(safe-area-inset-top,0px\)\)/);
});
test('safe-area CSS gets a fresh cache-key when installed PWA updates',()=>{
  const asset='css/style.css?v=rc1-20261104-timeline';
  assert.ok(html.includes(asset));
  assert.ok(worker.includes('./'+asset));
});
