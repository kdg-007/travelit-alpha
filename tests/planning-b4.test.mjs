import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseBudgetEntry,normalizeExpense,normalizeVehicle} from '../js/trip-costs.js';
const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../css/style.css',import.meta.url),'utf8');
const trip={id:'trip-test',startDate:'2026-12-05',endDate:'2026-12-09'};
const now='2026-11-02T00:00:00.000Z';
test('arithmetic formula supports Sagada budget calculations',()=>{
 assert.equal(parseBudgetEntry('=3000*5'),15000);
 assert.equal(parseBudgetEntry('=(900/12)*75'),5625);
 assert.equal(parseBudgetEntry('=1500*(6+2)'),12000);
 assert.equal(parseBudgetEntry('=3000*5+500'),15500);
 assert.equal(parseBudgetEntry('15000'),15000);
 assert.equal(parseBudgetEntry(''),null);
});
test('malformed or unsafe budget expressions are rejected',()=>{
 for(const bad of ['=alert(1)','=process.exit()','=3000/0','=3000**5','=1;2','=99999999999','=-100','=(5+3','hello','=2+3)'])assert.throws(()=>parseBudgetEntry(bad),Error,bad);
});
test('normalized expense retains both numeric result and editable formula',()=>{
 const e=normalizeExpense({label:'Hotel',category:'Accommodation',plannedPhp:'=3000*5',actualPhp:'=2000*2'},trip,now);
 assert.equal(e.plannedPhp,15000);
 assert.equal(e.actualPhp,4000);
 assert.equal(e.plannedFormula,'=3000*5');
 assert.equal(e.actualFormula,'=2000*2');
 const reloaded=normalizeExpense({...e,plannedPhp:e.plannedFormula,actualPhp:e.actualFormula},trip,now);
 assert.equal(reloaded.plannedPhp,15000);
});
test('vehicle supports optional nickname, make and model',()=>{
 const v=normalizeVehicle({make:'MG',model:'MG6',nickname:'Family car',type:'Gasoline',kmPerLiter:'12',fuelPricePhp:'75'},now);
 assert.equal(v.name,'Family car');
 assert.equal(v.make,'MG');assert.equal(v.model,'MG6');assert.equal(v.kmPerLiter,12);
 const unnamed=normalizeVehicle({make:'MG',model:'MG6'},now);
 assert.equal(unnamed.name,'MG MG6');
});
test('legacy saved vehicles remain compatible',()=>{
 const v=normalizeVehicle({name:'Older profile',type:'Gasoline',kmPerLiter:10,fuelPricePhp:70},now);
 assert.equal(v.name,'Older profile');assert.equal(v.make,'');assert.equal(v.model,'');
});
test('vehicle action points to assignment editor, not Edit trip',()=>{
 assert.match(app,/action\('Choose vehicle','assign-trip-vehicle'\)/);
 assert.doesNotMatch(app,/action\('Edit trip vehicle','edit-trip'\)/);
 assert.match(app,/function tripVehicleEditor\(\)/);
});
test('Prepare is rendered and navigates to existing trip tools',()=>{
 assert.match(app,/function renderPreparation\(t\)/);
 assert.match(app,/reviewTripPreparation\(/);
 assert.match(app,/prep-jump:/);
});
test('packing mind-map generates existing persisted checklist records',()=>{
 assert.match(app,/function packingMindmapEditor\(\)/);
 assert.match(app,/Generate checklist/);
 assert.match(app,/guardedSaveRecords\(state\.db,'packing',records/);
 assert.match(app,/packmap/);
 assert.match(css,/\.packing-map-nodes/);
});
test('recognizable map is online only, with offline tools separate',()=>{
 assert.match(app,/www\.openstreetmap\.org\/export\/embed\.html/);
 assert.match(app,/Online map/);
 assert.match(app,/Offline maps and annotations/);
 assert.doesNotMatch(app,/tile\.openstreetmap\.org/);
});
