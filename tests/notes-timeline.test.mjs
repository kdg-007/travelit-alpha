import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeLocalNote,previewNote,linkedNotes} from '../js/local-notes.js';
import {timelineForDay,timelinePosition,shiftTimelineStop,formatClock} from '../js/travel-timeline.js';
import {validateBackup,SCHEMA_VERSION} from '../js/domain.js';
const when='2026-11-02T00:00:00.000Z';
const trip={id:'trip-1',title:'Sagada',startDate:'2026-12-05',endDate:'2026-12-09'};
test('native note contains actual content and relationship in v6 backup',()=>{
 const note=normalizeLocalNote({id:'note123',title:'Packing',content:'# Preparations\n- Rain jacket',targetType:'trip',targetId:trip.id},when);
 const records=[{key:'trip:'+trip.id,type:'trip',id:trip.id,data:{...trip,timezone:'Asia/Manila',createdAt:when,updatedAt:when}},{key:'note:'+note.id,type:'note',id:note.id,data:note}];
 assert.equal(SCHEMA_VERSION,7);
 assert.equal(validateBackup({format:'travelit-local-backup',schemaVersion:7,records,outbox:[]}),true);
 assert.equal(records[1].data.content,'# Preparations\n- Rain jacket');
 assert.throws(()=>validateBackup({format:'travelit-local-backup',schemaVersion:5,records,outbox:[]}));
});
test('prior v5 backup without local notes is still accepted',()=>{
 assert.equal(validateBackup({format:'travelit-local-backup',schemaVersion:5,records:[],outbox:[]}),true);
});
test('preview never executes raw HTML or untrusted links',()=>{
 const html=previewNote('# Trip\n<script>alert(1)</script>\n- **Food**');
 assert.match(html,/&lt;script&gt;/);
 assert.doesNotMatch(html,/<script|<a href/i);
 assert.match(html,/<strong>Food<\/strong>/);
});
test('local note links preserve independent contexts',()=>{
 const n=[normalizeLocalNote({id:'note101',targetType:'trip',targetId:'a',content:'A'},when),
   normalizeLocalNote({id:'note102',targetType:'place',targetId:'b',content:'B'},when)];
 assert.equal(linkedNotes(n,'trip','a').length,1);
 assert.equal(linkedNotes(n,'place','b')[0].content,'B');
});
test('timeline shares existing activity records and respects fixed bookings',()=>{
 const stops=[
  {id:'a',date:'2026-12-05',time:'09:00',durationMinutes:90,title:'Museum',fixed:false,kind:'Activity'},
  {id:'b',date:'2026-12-05',time:'10:45',durationMinutes:60,title:'Hotel',fixed:true,kind:'Hotel'},
  {id:'c',date:'2026-12-05',time:'',durationMinutes:0,title:'Flexible meal',fixed:false,kind:'Meal'}
 ];
 const chart=timelineForDay(stops,'2026-12-05');
 assert.equal(chart.events.length,2);assert.equal(chart.untimed.length,1);
 assert.ok(timelinePosition(chart.events[0],chart).left>=0);
 assert.equal(shiftTimelineStop(stops[0],15,trip).time,'09:15');
 assert.equal(stops[0].time,'09:00','normalization must not mutate saved record');
 assert.throws(()=>shiftTimelineStop(stops[1],15,trip),/Fixed bookings/);
 assert.equal(formatClock(555),'09:15');
});
test('app exposes note editing and two-way timeline/table selection',()=>{
 const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
 assert.match(app,/async function noteEditor/);
 assert.match(app,/guardedSaveRecord\(state\.db,'note',obj,guard\)/);
 assert.match(app,/state\.notes=of\('note'\)/);
 assert.match(app,/itinerary-mode:timeline/);
 assert.match(app,/itinerary-mode:table/);
 assert.match(app,/function bindTripTimeline/);
});
