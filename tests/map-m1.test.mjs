import test from 'node:test';
import assert from 'node:assert/strict';
import {validPin,placedMarkers,boundsForMarkers} from '../js/live-map.js';
test('pins from saved places have correct coordinates and preserve source IDs',()=>{
 const places=[
  {id:'a',name:'Hotel',lat:17.6,lng:121.7,category:'Hotel'},
  {id:'b',name:'Restaurant',lat:17.65,lng:121.75},
  {id:'c',name:'Unlocated',lat:null,lng:null},
  {id:'d',name:'Broken',lat:120,lng:123}
 ];
 const pins=placedMarkers(places,[],null);
 assert.equal(pins.length,2);
 assert.equal(pins[0].id,'a');
 assert.equal(pins[0].name,'Hotel');
 assert.equal(pins[1].category,'Place');
 assert.equal(validPin(places[2]),false);
 assert.equal(validPin(places[3]),false);
});
test('trip labels are chronological without deleting other saved pins',()=>{
 const places=[{id:'A',lat:17,lng:121},{id:'B',lat:18,lng:122},{id:'C',lat:19,lng:123}];
 const stops=[
  {tripId:'trip-1',placeId:'B',date:'2026-12-06',time:'09:00',sortOrder:2},
  {tripId:'trip-1',placeId:'A',date:'2026-12-05',time:'07:00',sortOrder:1},
  {tripId:'trip-2',placeId:'C',date:'2026-12-05',time:'08:00',sortOrder:1}
 ];
 const pins=placedMarkers(places,stops,'trip-1');
 assert.equal(pins.length,3);
 assert.deepEqual(pins.map(p=>p.tripOrder),[1,2,null]);
});
test('bounds include all valid pins, including zero coordinates',()=>{
 const pins=placedMarkers([{id:'0',lat:0,lng:0},{id:'1',lat:20,lng:130}],[],null);
 assert.deepEqual(boundsForMarkers(pins),{minLat:0,maxLat:20,minLng:0,maxLng:130});
 assert.equal(boundsForMarkers([]),null);
});
test('map code does not download bulk tiles or require credentials',async()=>{
 const {readFileSync}=await import('node:fs');
 const s=readFileSync(new URL('../js/live-map.js',import.meta.url),'utf8');
 assert.match(s,/tiles\.openfreemap\.org\/styles\/liberty/);
 assert.doesNotMatch(s,/tile\.openstreetmap\.org/);
 assert.doesNotMatch(s.replace(/^\/\*[\s\S]*?\*\//,''),/api_key|API_KEY|billing|downloadRegion|prefetchTiles/);
 assert.match(s,/setLiveMapPinMode/);
});
