import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePhoto,galleryItems} from '../js/photo-stories.js';
import {validateBackup,SCHEMA_VERSION} from '../js/domain.js';
import {readFileSync} from 'node:fs';
const trip={id:'trip123',title:'Sagada',startDate:'2026-12-05',endDate:'2026-12-09',timezone:'Asia/Manila'};
const stamp='2026-11-03T00:00:00.000Z';
const image='data:image/jpeg;base64,/9j/4AAQSkZJRg==';
test('photo record includes a bounded self-contained compressed image',()=>{
 const p=normalizePhoto({id:'photo001',image,title:'Sunrise',caption:'View from camp',tripId:trip.id,photoDate:'2026-12-06'},stamp);
 assert.equal(p.tripId,trip.id);
 assert.equal(p.photoDate,'2026-12-06');
 assert.equal(p.image,image);
 assert.equal(p.origin,'travelit-local-photo');
 assert.throws(()=>normalizePhoto({id:'photo002',image:'https://example.com/image.jpg'}),/supported, compressed/);
 assert.throws(()=>normalizePhoto({id:'photo003',image:'data:image/svg+xml;base64,PHN2Zz4='}),/supported, compressed/);
 assert.throws(()=>normalizePhoto({id:'photo004',image,title:'A',photoDate:'2026-02-30'}));
});
test('photo gallery includes saved-place covers without duplicating records',()=>{
 const photos=[normalizePhoto({id:'photo005',image,title:'Morning',tripId:trip.id},stamp)];
 const places=[{id:'place1',name:'North Camp Beach',coverImage:image,notes:'Saved from a reel',updatedAt:stamp}];
 const all=galleryItems(photos,places);
 assert.equal(all.length,2);
 assert.equal(galleryItems(photos,places,'photos').length,1);
 assert.equal(galleryItems(photos,places,'places').length,1);
 assert.equal(galleryItems(photos,places,'trip',trip.id).length,1);
 assert.equal(all.find(x=>x.kind==='cover').title,'North Camp Beach');
});
test('new verified backup schema accepts full photo image and historical v6',()=>{
 const p=normalizePhoto({id:'photo005',image,title:'Trip memory'},stamp);
 const records=[{key:'photo:'+p.id,type:'photo',id:p.id,data:p}];
 assert.equal(SCHEMA_VERSION,7);
 assert.equal(validateBackup({format:'travelit-local-backup',schemaVersion:7,records,outbox:[]}),true);
 assert.equal(validateBackup({format:'travelit-local-backup',schemaVersion:6,records:[],outbox:[]}),true);
 assert.throws(()=>validateBackup({format:'travelit-local-backup',schemaVersion:6,records,outbox:[]}),/Older backup/);
});
test('editorial app exposes real photos, not only saved-place cover thumbnails',()=>{
 const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../css/style.css',import.meta.url),'utf8');
 assert.match(app,/function photoImportEditor\(/);
 assert.match(app,/function photoEditEditor\(/);
 assert.match(app,/function renderPhotos\(/);
 assert.match(app,/guardedSaveRecords\(state\.db,'photo',records/);
 assert.match(app,/function renderExplore\(/);
 assert.match(app,/function renderToday\(/);
 assert.match(css,/\.editorial-photo-grid/);
});
