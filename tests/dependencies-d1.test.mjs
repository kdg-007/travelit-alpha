import test from 'node:test';
import assert from 'node:assert/strict';
import {dependencyOrder,dependencyConflicts,proposeDependencyReflow,tripMinute,minuteToTripDate} from '../js/trip-dependencies.js';
import {normalizeStop,validateBackup,SCHEMA_VERSION} from '../js/domain.js';
const trip={id:'trip',title:'Sagada',startDate:'2026-12-05',endDate:'2026-12-09',timezone:'Asia/Manila'};
const when='2026-11-03T00:00:00.000Z';
function make(id,title,date,time,durationMinutes=60,predecessorId=null,lagMinutes=0,fixed=false){
 return normalizeStop({id,tripId:trip.id,title,date,time,durationMinutes,predecessorId,lagMinutes,fixed},trip,when);
}
function base(){return [
 make('A','Drive','2026-12-05','08:00',120),
 make('B','Lunch','2026-12-05','09:00',60,'A',30),
 make('C','Museum','2026-12-05','10:00',75,'B',15),
 make('D','Hotel booking','2026-12-06','14:00',60,null,0,true)
];}
test('topological order, buffer and forward-only chain',()=>{
 const arr=base();
 assert.deepEqual(dependencyOrder([arr[2],arr[1],arr[0],arr[3]],trip.id).map(x=>x.id).slice(0,3),['A','B','C']);
 const issues=dependencyConflicts(arr,trip);
 assert.deepEqual(issues.map(i=>i.id),['B','C']);
 const result=proposeDependencyReflow(arr,trip);
 assert.deepEqual(result.changes.map(x=>[x.id,x.toDate,x.toTime]),[
  ['B','2026-12-05','10:30'],['C','2026-12-05','11:45']
 ]);
 assert.equal(arr[1].time,'09:00','reflow must not mutate originals');
 assert.equal(result.planned.find(x=>x.id==='D').time,'14:00');
});
test('cross-day successor rolls forward, but never past trip end',()=>{
 const a=make('A','Evening drive','2026-12-05','23:10',80);
 const b=make('B','Check in','2026-12-05','23:20',20,'A',10);
 const result=proposeDependencyReflow([b,a],trip);
 assert.equal(result.changes[0].toDate,'2026-12-06');
 assert.equal(result.changes[0].toTime,'00:40');
 assert.equal(minuteToTripDate(tripMinute(a,trip)+90,trip).date,'2026-12-06');
 const last=make('L','Late drive','2026-12-09','23:20',60);
 const end=make('M','End','2026-12-09','23:30',40,'L');
 assert.throws(()=>proposeDependencyReflow([last,end],trip),/after the trip ends/);
});
test('fixed commitment conflicts stop the whole proposed reflow',()=>{
 const a=make('A','Drive','2026-12-05','08:00',90);
 const f=make('F','Flight','2026-12-05','09:00',40,'A',15,true);
 assert.deepEqual(dependencyConflicts([a,f],trip).map(x=>x.kind),['fixed-conflict']);
 assert.throws(()=>proposeDependencyReflow([a,f],trip),/Fixed booking/);
});
test('reject missing, cross-trip, self and circular predecessor links',()=>{
 const a=make('A','Drive','2026-12-05','09:00');
 assert.throws(()=>dependencyOrder([{...a,predecessorId:'X'}],trip.id),/same trip/);
 assert.throws(()=>dependencyOrder([{...a,predecessorId:'A'}],trip.id),/itself/);
 const b=make('B','Lunch','2026-12-05','10:00',60,'A');
 assert.throws(()=>dependencyOrder([{...a,predecessorId:'B'},b],trip.id),/cycle/);
 assert.throws(()=>dependencyOrder([a,{...b,lagMinutes:-1}],trip.id),/0–1440/);
 const foreign=make('C','Foreign','2026-12-05','12:00');
 foreign.tripId='another';
 assert.throws(()=>dependencyOrder([{...a,predecessorId:'C'},foreign],trip.id),/same trip/);
});
test('older stops without predecessors remain compatible',()=>{
 const old=normalizeStop({id:'o',title:'Free time',date:'2026-12-05',time:'',durationMinutes:0},trip,when);
 assert.equal(old.predecessorId,null);assert.equal(old.lagMinutes,0);
 assert.deepEqual(dependencyConflicts([old],trip),[]);
 assert.deepEqual(proposeDependencyReflow([old],trip).changes,[]);
});
test('missing predecessor time prevents a guessed reflow',()=>{
 const a=make('A','Flexible transfer','2026-12-05','',60);
 const b=make('B','Breakfast','2026-12-05','08:00',45,'A');
 assert.equal(dependencyConflicts([a,b],trip)[0].kind,'unscheduled');
 assert.throws(()=>proposeDependencyReflow([a,b],trip),/Set a time/);
});
test('backup validator rejects circular and cross-trip links without changing schema',()=>{
 const trips=[{key:'trip:'+trip.id,id:trip.id,type:'trip',data:{...trip,createdAt:when,updatedAt:when}}];
 const a=make('A','Start','2026-12-05','08:00');
 const b=make('B','End','2026-12-05','10:00',60,'A');
 const records=[...trips,...[a,b].map(data=>({key:'stop:'+data.id,id:data.id,type:'stop',data}))];
 assert.equal(SCHEMA_VERSION,7);
 assert.equal(validateBackup({format:'travelit-local-backup',schemaVersion:7,records,outbox:[]}),true);
 const invalid=records.map(r=>({...r,data:{...r.data}}));
 invalid[1].data.predecessorId='B';
 assert.throws(()=>validateBackup({format:'travelit-local-backup',schemaVersion:7,records:invalid,outbox:[]}),/cycle/);
});
test('other stop metadata is preserved by a forward-only proposal',()=>{
 const a=make('A','Departure','2026-12-05','08:00',120);
 const b={...make('B','Lunch','2026-12-05','09:00',60,'A'),notes:'Restaurant confirmed',placeId:'pin-123',legDistanceKm:27};
 const p=proposeDependencyReflow([a,b],trip).changes[0].updated;
 assert.equal(p.placeId,'pin-123');assert.equal(p.notes,'Restaurant confirmed');assert.equal(p.legDistanceKm,27);
});
