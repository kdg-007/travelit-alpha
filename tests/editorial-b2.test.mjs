import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizePlace,normalizeTrip,normalizeStop,validateBackup} from '../js/domain.js';
import {createBackup,verifyBackup} from '../js/backup.js';
const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../css/style.css',import.meta.url),'utf8');
test('Explore uses editorial stories rather than raw URL panels',()=>{
 const a=app.slice(app.indexOf('function renderExplore(){'),app.indexOf('function activePack('));
 assert.match(a,/library-toolbar/);assert.match(a,/story-grid/);assert.match(a,/placeCover\(p\)/);
 assert.doesNotMatch(a,/class="url-short"|Location verification:|assign its location only when known/);
});
test('Today does not expose engineering readiness warnings',()=>{
 const a=app.slice(app.indexOf('function renderToday(){'),app.indexOf('async function savePackingBatch'));
 assert.match(a,/editorial-today-empty/);assert.match(a,/editorial-stop/);
 assert.doesNotMatch(a,/Offline limitation:|renderPreparation\(/);
});
test('Itinerary supports multiple visible row edits and one guarded save',()=>{
 assert.match(app,/function itineraryInputRow/);assert.match(app,/function renderItinerary/);assert.match(app,/function saveItineraryGrid/);
 assert.match(app,/guardedSaveRecords\(state\.db,'stop',list/);
 assert.match(app,/data-base-revision/);assert.match(app,/expectedPresenceByKey:presence/);
 assert.match(app,/add-itinerary-row/);assert.match(app,/save-itinerary-grid/);
 assert.match(css,/\.itinerary-table/);
});
test('JPEG covers are optional, bounded and neither scripts nor remote URLs',()=>{
 const p=normalizePlace({name:'Synthetic beach',coverImage:'data:image/jpeg;base64,'+'A'.repeat(1000)});
 assert.match(p.coverImage,/^data:image\/jpeg;base64,/);
 assert.throws(()=>normalizePlace({name:'Bad',coverImage:'data:image/svg+xml;base64,AAAA'}));
 assert.throws(()=>normalizePlace({name:'Bad',coverImage:'javascript:alert(1)'}));
 assert.throws(()=>normalizePlace({name:'Big',coverImage:'data:image/jpeg;base64,'+'A'.repeat(195000)}));
 assert.equal(normalizePlace({name:'Old place without an image'}).coverImage,'');
});
test('image cover remains inside verified TravelIt backup and its readback',async()=>{
 const p=normalizePlace({name:'Synthetic beach',coverImage:'data:image/jpeg;base64,'+'A'.repeat(1000)});
 const r={type:'place',key:'place:'+p.id,id:p.id,data:p,localRevision:1};
 const b=await createBackup({records:[r],outbox:[]});
 assert.equal(validateBackup(b),true);
 const restored=await verifyBackup(b);
 assert.equal(restored.backup.records[0].data.coverImage,p.coverImage);
});
test('existing travel legs and fixed bookings remain when editing day-grid fields',()=>{
 const trip=normalizeTrip({title:'Synthetic weekend',startDate:'2026-12-05',endDate:'2026-12-07'});
 const old=normalizeStop({title:'Morning market',date:'2026-12-05',time:'08:00',fixed:true,legDistanceKm:12,legTravelMinutes:24},trip);
 const edited=normalizeStop({...old,title:'Breakfast',time:'08:30'},trip);
 assert.equal(edited.fixed,true);assert.equal(edited.legDistanceKm,12);assert.equal(edited.legTravelMinutes,24);
});
test('Photos combines native local pictures with saved-place covers without fake remote thumbnails',()=>{
 const section=app.slice(app.indexOf('function renderPhotos(){'),app.indexOf('function renderMoreTechnical'));
 assert.match(section,/galleryItems\(state\.photos,state\.places/);
 assert.match(section,/No photos yet/);assert.doesNotMatch(section,/automatically imported|automatically geolocated/);
});
test('status bar remains protected without hiding primary app navigation',()=>{
 assert.match(css,/display-mode:standalone/);assert.match(css,/safe-area-inset-top/);
 assert.match(app,/\['photos','Photos'/);
});
