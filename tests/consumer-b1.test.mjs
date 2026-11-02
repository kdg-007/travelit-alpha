import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeTrip,normalizePacking,validateBackup} from '../js/domain.js';
const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../css/style.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('mobile navigation has Photos and keeps Packing contextual',()=>{
 assert.match(app,/\['photos','Photos'/);
 assert.doesNotMatch(app,/\['packing','Packing','✓'/);
 assert.match(app,/state\.tripTab='packing'/);
});
test('trip creation is independent from vehicles and leads from departure to return',()=>{
 const start=app.indexOf('function tripEditor('),end=app.indexOf('function tripVehicleEditor(');
 assert.ok(start>=0&&end>start);
 const editor=app.slice(start,end);
 assert.doesNotMatch(editor,/f-vehicleId/);
 assert.match(editor,/returnDate\.focus/);
});
test('packing has a table and saves a batch in one guarded transaction',()=>{
 assert.match(app,/function packingDraftRow/);
 assert.match(app,/function savePackingBatch/);
 assert.match(app,/guardedSaveRecords\(state\.db,'packing',items/);
 assert.match(app,/class="packing-table packing-entry"/);
 assert.match(css,/sheet-scroll/);
});
test('developer diagnostics are hidden by default',()=>{
 assert.match(app,/<details class="advanced-diagnostics">/);
 assert.match(app,/function renderMoreTechnical/);
 assert.doesNotMatch(html,/Integration Candidate 0\.29\.0/);
});
test('legacy v5 trip and packing backup remains valid',()=>{
 const trip=normalizeTrip({title:'QA test',startDate:'2026-12-05',endDate:'2026-12-07',vehicleId:null,timezone:'Asia/Manila'});
 const item=normalizePacking({label:'Camera',quantity:2,category:'Electronics'},trip);
 const rows=[{key:'trip:'+trip.id,id:trip.id,type:'trip',data:trip},{key:'packing:'+item.id,id:item.id,type:'packing',data:item}];
 assert.equal(validateBackup({format:'travelit-local-backup',schemaVersion:5,records:rows,outbox:[]}),true);
});
test('Photos tab is honest about missing photo storage',()=>{
 assert.match(app,/function renderPhotos/);
 assert.match(app,/full-resolution photo library and KeepIt integration are not connected/);\n assert.match(app,/function placeCover/);
});
