import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../css/style.css',import.meta.url),'utf8');
const body=app.slice(app.indexOf('function renderTripTimeline('),app.indexOf('function bindTripTimeline('));
test('empty itinerary shows a readable prompt without cropped hour ruler',()=>{
 assert.match(body,/if\(!layout\.events\.length\)/);
 assert.match(body,/No timed activities yet/);
});
test('dense timeline reduces tick labels and aligns boundary ticks',()=>{
 assert.match(body,/layout\.span>1080\?240:layout\.span>480\?120:60/);
 assert.match(css,/\.timeline-tick:first-child/);
 assert.match(css,/\.timeline-tick:last-child/);
});
test('phone confirmation toast clears bottom tabs',()=>{
 assert.match(css,/\.toast\{bottom:calc\(84px \+ env\(safe-area-inset-bottom,0px\)\)/);
 assert.match(css,/\.timeline-pan-hint\{display:block/);
});
