import test from 'node:test';
import assert from 'node:assert/strict';
import {STARTER_BRANCHES,collectPackingTree} from '../js/packing-tree.js';
import {normalizePacking,validateBackup,SCHEMA_VERSION} from '../js/domain.js';
const makeRoot=branches=>({
 querySelectorAll:key=>key==='[data-pack-tree-branch]'?branches.map(branch=>({
  dataset:{category:branch.category},
  querySelector:key=>key==='[data-pack-tree-group]'?{value:branch.group}:null,
  querySelectorAll:key=>key==='[data-pack-tree-item]'?branch.items.map(value=>({value})):[]
 })):[]
});
const trip={id:'t123',title:'Sagada',startDate:'2026-12-05',endDate:'2026-12-09',timezone:'Asia/Manila'};
const now='2026-11-03T00:00:00.000Z';
test('starter branches reflect separate travel packing systems',()=>{
 assert.ok(STARTER_BRANCHES.some(x=>/food/i.test(x.group)));
 assert.ok(STARTER_BRANCHES.some(x=>/family/i.test(x.group)));
 assert.ok(STARTER_BRANCHES.some(x=>/sleep/i.test(x.group)));
});
test('map ideas become tabular checklist rows and preserve branch names',()=>{
 const tree=makeRoot([
  {category:'Essentials',group:'Documents',items:['Passport','License']},
  {category:'Other',group:'Food & cooking',items:['Breakfast','Water','']},
  {category:'Clothing',group:'Clothing',items:['Rain jacket']}
 ]);
 const out=collectPackingTree(tree,[{label:'Passport'}]);
 assert.deepEqual(out.items.map(x=>x.label),['License','Breakfast','Water','Rain jacket']);
 assert.equal(out.items[1].category,'Other');
 assert.equal(out.items[1].group,'Food & cooking');
 assert.deepEqual(out.skipped,['Passport']);
 const normalized=out.items.map(x=>normalizePacking(x,trip,now));
 assert.equal(normalized[1].group,'Food & cooking');
 assert.equal(normalized[1].quantity,1);
});
test('duplicates inside multiple branches do not produce duplicate checklist items',()=>{
 const x=collectPackingTree(makeRoot([
  {category:'Essentials',group:'Travel',items:['Ticket','Ticket']},
  {category:'Other',group:'Other',items:[' ticket ','Bag']}
 ]));
 assert.deepEqual(x.items.map(z=>z.label),['Ticket','Bag']);
 assert.equal(x.skipped.length,2);
});
test('long and excessive plans are rejected before saving',()=>{
 const oversize=makeRoot([{category:'Other',group:'Gear',items:['x'.repeat(151)]}]);
 assert.throws(()=>collectPackingTree(oversize),/150/);
 const count=makeRoot([{category:'Other',group:'Gear',items:Array.from({length:61},(_,i)=>'Item '+i)}]);
 assert.throws(()=>collectPackingTree(count),/60/);
});
test('pack groups survive v6 verified backup shape, old records still valid',()=>{
 const a=normalizePacking({label:'Rain jacket',category:'Clothing',group:'Trail kit',quantity:1},trip,now);
 const b=normalizePacking({label:'Old paper checklist',category:'Essentials',quantity:1},trip,now);
 assert.equal(b.group,'');
 const records=[
  {key:'trip:'+trip.id,id:trip.id,type:'trip',data:{...trip,createdAt:now,updatedAt:now}},
  ...[a,b].map(data=>({key:'packing:'+data.id,id:data.id,type:'packing',data}))
 ];
 assert.equal(SCHEMA_VERSION,6);
 assert.equal(validateBackup({format:'travelit-local-backup',schemaVersion:6,records,outbox:[]}),true);
});
