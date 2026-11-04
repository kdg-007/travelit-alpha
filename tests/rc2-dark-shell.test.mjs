import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const text=p=>readFileSync(new URL(p,root),'utf8');
const html=text('index.html'),css=text('css/style.css'),js=text('js/app.js'),sw=text('sw.js');
test('TravelIt is dark-first but respects existing explicit light setting before paint',()=>{
 const script=html.slice(html.indexOf('<script>'),html.indexOf('</script>')+9);
 assert.match(script,/var t='dark'/);
 assert.match(script,/p\.theme==='light'/);
 assert.match(script,/document\.documentElement\.dataset\.theme=t/);
 assert.ok(html.indexOf('<script>')<html.indexOf('rel="stylesheet"'));
});
test('sidebar has accessible toggle and pure UI-only preference store',()=>{
 assert.match(html,/id="sidebar-toggle"[^>]*aria-controls="travel-sidebar"/);
 assert.match(html,/id="sidebar-scrim"/);
 assert.match(html,/id="theme-toggle"/);
 assert.match(js,/installTravelItWorkspaceChrome/);
 assert.match(js,/travelit_ui_preferences_v1/);
 assert.match(js,/prefs\.sidebar==='expanded'\?'compact'/);
 assert.match(css,/#app\[data-sidebar="hidden"\] \.app-main/);
 assert.match(css,/#app\[data-sidebar="compact"\] \.app-main/);
 assert.match(css,/#app\[data-sidebar="drawer"\] \.sidebar-scrim/);
});
test('legacy record store and RC1 preview isolation are untouched',()=>{
 const db=text('js/db.js');
 assert.match(db,/const NAME='travelit-foundation'/);
 assert.match(js,/const KEY='travelit_ui_preferences_v1'/);
 assert.doesNotMatch(js.slice(js.lastIndexOf('function installTravelItWorkspaceChrome')),/indexedDB|allData\(|guardedSaveRecord|deleteDatabase|caches\.delete/);
 assert.match(sw,/travelit-foundation-shell-v0\.40-rc2-dark-workspace/);
 assert.match(sw,/css\/style\.css\?v=rc2-dark-workspace/);
 assert.match(html,/css\/style\.css\?v=rc2-dark-workspace/);
});
