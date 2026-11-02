import {validCoords, cleanText, uid} from './domain.js';

export const ANNOTATION_KINDS=['pin','line','area'];
export function normalizeAnnotation(input, now=new Date().toISOString()){
  if(!ANNOTATION_KINDS.includes(input.kind)) throw Error('Annotation must be a pin, line, or area.');
  const label=cleanText(input.label,150);if(!label)throw Error('Give the map annotation a name.');
  if(!Array.isArray(input.points)||input.points.length>200)throw Error('Annotation requires 1–200 geographic points.');
  const min=input.kind==='pin'?1:input.kind==='line'?2:3;
  if(input.points.length<min||(input.kind==='pin'&&input.points.length!==1))throw Error(`${input.kind} needs ${min}${input.kind==='pin'?'':' or more'} point(s).`);
  const points=input.points.map(p=>{if(!p||!validCoords(p.lat,p.lng))throw Error('Annotation contains invalid coordinates.');return {lat:Number(p.lat),lng:Number(p.lng)};});
  return {id:input.id||uid(),kind:input.kind,label,points,notes:cleanText(input.notes,2000),tripId:input.tripId||null,createdAt:input.createdAt||now,updatedAt:now};
}
export function exactCoordinatesFromLink(raw){
  let u;try{u=new URL(raw);}catch{return null;}
  if(!['https:','http:'].includes(u.protocol))return null;
  const host=u.hostname.toLowerCase(),isGoogle=/^(?:(?:www|maps)\.)?google\.(?:com|com\.ph|co\.uk)$/.test(host);
  const isWaze=host==='waze.com'||host==='www.waze.com';const isApple=host==='maps.apple.com';
  if(!isGoogle&&!isWaze&&!isApple)return null;
  let value=null;
  if(isWaze||isApple)value=u.searchParams.get('ll');
  if(isGoogle){
    const p=u.searchParams.get('q')||u.searchParams.get('query');
    if(p&&/^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/.test(p))value=p;
    if(!value){const m=u.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,|\/|$)/);if(m)value=`${m[1]},${m[2]}`;}
  }
  if(!value||!/^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/.test(value))return null;
  const [lat,lng]=value.split(',').map(Number);return validCoords(lat,lng)?{lat,lng}:null;
}
export function mapBounds(points){
  if(!points.length)return {minLat:4,maxLat:22,minLng:116,maxLng:128};
  let minLat=Math.min(...points.map(p=>p.lat)),maxLat=Math.max(...points.map(p=>p.lat));
  let minLng=Math.min(...points.map(p=>p.lng)),maxLng=Math.max(...points.map(p=>p.lng));
  const latPad=Math.max((maxLat-minLat)*.18,.3),lngPad=Math.max((maxLng-minLng)*.18,.3);
  minLat=Math.max(-90,minLat-latPad);maxLat=Math.min(90,maxLat+latPad);
  minLng=Math.max(-180,minLng-lngPad);maxLng=Math.min(180,maxLng+lngPad);
  if(maxLat===minLat){minLat=Math.max(-90,minLat-.1);maxLat=Math.min(90,maxLat+.1);}
  if(maxLng===minLng){minLng=Math.max(-180,minLng-.1);maxLng=Math.min(180,maxLng+.1);}
  return {minLat,maxLat,minLng,maxLng};
}
export function geoToPlot(p,b){return {x:35+630*(p.lng-b.minLng)/(b.maxLng-b.minLng),y:310-260*(p.lat-b.minLat)/(b.maxLat-b.minLat)};}
export function plotToGeo(x,y,b){if(x<35||x>665||y<50||y>310)return null;const p={lat:b.minLat+(310-y)/260*(b.maxLat-b.minLat),lng:b.minLng+(x-35)/630*(b.maxLng-b.minLng)};return validCoords(p.lat,p.lng)?p:null;}
export function assessOfflineTrip({trip,stops=[],places=[],packing=[],shellCached=false,mapPackAvailable=false}){
  if(!trip)return {ready:false,warnings:['Select a trip to prepare offline.'],cachedRecords:0};
  const ps=new Map(places.map(p=>[p.id,p]));const scheduled=stops.filter(s=>s.tripId===trip.id);
  const withoutPin=scheduled.filter(s=>s.placeId&&!validCoords(ps.get(s.placeId)?.lat,ps.get(s.placeId)?.lng)).length;
  const unpinned=scheduled.filter(s=>!s.placeId).length;
  const warnings=[];
  if(!shellCached)warnings.push('Offline application shell is not yet verified.');
  if(!mapPackAvailable)warnings.push('No verified offline road navigation is installed. A street-reference map alone does not provide routing.');
  if(withoutPin)warnings.push(`${withoutPin} selected destination(s) lack valid navigation pins.`);
  if(unpinned)warnings.push(`${unpinned} itinerary entry/entries have no destination assigned.`);
  const items=packing.filter(p=>p.tripId===trip.id);const unpacked=items.filter(p=>!p.packed).length;
  if(unpacked)warnings.push(`${unpacked} packing item(s) remain unchecked.`);
  return {ready:warnings.length===0,warnings,cachedRecords:scheduled.length+items.length,caveat:'Live traffic, Waze routing, and unsaved online media cannot be guaranteed offline.'};
}
