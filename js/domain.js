import {normalizeKeepItAssociation,logicalAssociationKey} from './keepit-associations.js';
import {normalizeVehicle,normalizeExpense,normalizeLeg} from './trip-costs.js';
import {DISCOVERY_STAGES} from './travel-planning.js';
export const SCHEMA_VERSION = 5;
export const PLACE_CATEGORIES = ['Destination','Restaurant','Hotel','Beach','Attraction','Other'];
export const STOP_KINDS = ['Activity','Travel','Meal','Hotel','Other'];
export const PACK_CATEGORIES = ['Essentials','Clothing','Personal care','Electronics','Family','Other'];
export const VALID_TYPES = ['place','trip','stop','packing','annotation','vehicle','expense','keepitAssociation'];
export const uid = () => globalThis.crypto?.randomUUID?.() || `id_${Date.now()}_${Math.random().toString(36).slice(2)}`;
export const cleanText = (v, max=280) => String(v ?? '').trim().slice(0,max);
export function validCoords(lat,lng){const valid=v=>(typeof v==='number'&&Number.isFinite(v))||(typeof v==='string'&&/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(v.trim()));return valid(lat)&&valid(lng)&&Number(lat)>=-90&&Number(lat)<=90&&Number(lng)>=-180&&Number(lng)<=180;}
export function normalizePlace(input, now = new Date().toISOString()){
  const name=cleanText(input.name,150), sourceUrl=cleanText(input.sourceUrl,2000);
  if(!name && !sourceUrl) throw Error('Enter a place name or a source link.');
  if(sourceUrl){try{const u=new URL(sourceUrl); if(!['https:','http:'].includes(u.protocol)) throw Error();}catch{throw Error('Source link must start with https:// or http://');}}
  const hasLat=String(input.lat??'').trim()!=='' || String(input.lng??'').trim()!=='';
  if(hasLat && !validCoords(input.lat,input.lng)) throw Error('Enter valid latitude AND longitude, or leave both empty.');
  if(input.stage!==undefined && !DISCOVERY_STAGES.includes(input.stage)) throw Error('Unknown discovery stage.');
  return {id:input.id||uid(),name:name||'Unidentified place', category:PLACE_CATEGORIES.includes(input.category)?input.category:'Other', stage:input.stage||'Idea', sourceUrl, lat:hasLat?Number(input.lat):null, lng:hasLat?Number(input.lng):null, notes:cleanText(input.notes,4000), createdAt:input.createdAt||now, updatedAt:now};
}
export function normalizeTrip(input,now=new Date().toISOString()){
  const title=cleanText(input.title,150);
  if(!title) throw Error('Trip name is required.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate||'') || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate||'') || !validDate(input.startDate) || !validDate(input.endDate)) throw Error('Enter valid start and end dates.');
  if(input.endDate<input.startDate) throw Error('End date cannot precede start date.');
  const timezone=cleanText(input.timezone||'Asia/Manila',100);
  try{ new Intl.DateTimeFormat('en-US',{timeZone:timezone});}catch{throw Error('Unknown time zone.');}
  const reserve=Number(input.fuelReservePct??10);if(!Number.isFinite(reserve)||reserve<0||reserve>50)throw Error('Fuel reserve must be 0–50%.');return {id:input.id||uid(),title,startDate:input.startDate,endDate:input.endDate,timezone,vehicleId:input.vehicleId||null,fuelReservePct:reserve,notes:cleanText(input.notes,2000),createdAt:input.createdAt||now,updatedAt:now};
}
export function validDate(v){ const d=new Date(v+'T12:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(v||'') && !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10)===v;}
export function normalizeStop(input,trip,now=new Date().toISOString()){
  const title=cleanText(input.title,150),date=input.date;
  if(!title) throw Error('Activity title is required.');
  if(!validDate(date) || date<trip.startDate || date>trip.endDate) throw Error('Activity date must be within trip dates.');
  const time=String(input.time||'').trim();
  if(time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw Error('Start time must be HH:MM.');
  const duration=Number(input.durationMinutes||0);
  if(!Number.isInteger(duration)||duration<0||duration>10080) throw Error('Duration must be 0–10080 minutes.');
  const sortOrder=input.sortOrder===undefined||input.sortOrder===null?1000000:Number(input.sortOrder);
  if(!Number.isInteger(sortOrder)||sortOrder<0||sortOrder>100000000) throw Error('Invalid itinerary order.');
  return {id:input.id||uid(),tripId:trip.id,placeId:input.placeId||null,title,date,time,durationMinutes:duration,kind:STOP_KINDS.includes(input.kind)?input.kind:'Activity',fixed:!!input.fixed,sortOrder,notes:cleanText(input.notes,2000),...normalizeLeg(input),createdAt:input.createdAt||now,updatedAt:now};
}
export function normalizePacking(input,trip,now=new Date().toISOString()){
  const label=cleanText(input.label,150),qty=Number(input.quantity??1);
  if(!label) throw Error('Packing item name is required.');
  if(!Number.isInteger(qty)||qty<1||qty>999) throw Error('Quantity must be 1–999.');
  return {id:input.id||uid(),tripId:trip.id,label,category:PACK_CATEGORIES.includes(input.category)?input.category:'Other',quantity:qty,packed:!!input.packed,owner:cleanText(input.owner,80),createdAt:input.createdAt||now,updatedAt:now};
}
export function wazeUrl(place){if(place?.lat===null||place?.lng===null||!validCoords(place?.lat,place?.lng)) return null;return `https://waze.com/ul?ll=${encodeURIComponent(place.lat+','+place.lng)}&navigate=yes`;}
export function tripDateAt(date,timezone='Asia/Manila'){
  const parts=new Intl.DateTimeFormat('en-US',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:timezone}).formatToParts(date);
  const x=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${x.year}-${x.month}-${x.day}`;
}
export function conflicts(stops){
  const timed=stops.filter(s=>s.time && s.durationMinutes>0).map(s=>({...s,start:Number(s.time.slice(0,2))*60+Number(s.time.slice(3)),end:Number(s.time.slice(0,2))*60+Number(s.time.slice(3))+s.durationMinutes})).sort((a,b)=>a.date.localeCompare(b.date)||a.start-b.start);
  const result=[];
  for(let i=0;i<timed.length;i++)for(let j=i+1;j<timed.length&&timed[i].date===timed[j].date;j++){if(timed[j].start<timed[i].end) result.push({a:timed[i].id,b:timed[j].id,kind:'time-overlap'});}
  return result;
}
export function validateBackup(data){
  if(!data || data.format!=='travelit-local-backup' || ![1,2,3,4,SCHEMA_VERSION].includes(data.schemaVersion) || !Array.isArray(data.records) || !Array.isArray(data.outbox)) throw Error('Not a supported TravelIt backup.');
  if(data.records.length>150000||data.outbox.length>300000) throw Error('Backup exceeds safety limits.');
  const ids=new Set(),associationKeys=new Set();
  const tripMap=new Map(data.records.filter(r=>r?.type==='trip'&&r.data).map(r=>[r.id,r.data]));
  const vehicleMap=new Map(data.records.filter(r=>r?.type==='vehicle'&&r.data).map(r=>[r.id,r.data]));
  for(const r of data.records){
    if(!r||!VALID_TYPES.includes(r.type)||typeof r.id!=='string'||!r.id||r.key!==`${r.type}:${r.id}`||!r.data||r.data.id!==r.id||typeof r.data.updatedAt!=='string')throw Error('Backup contains an invalid record.');
    if(data.schemaVersion<3&&['vehicle','expense'].includes(r.type))throw Error('Legacy backup cannot contain new financial records.');
    if(data.schemaVersion<5&&r.type==='keepitAssociation')throw Error('Older backup cannot contain KeepIt associations.');
    if(data.schemaVersion<4&&r.type==='place'&&r.data.stage!==undefined)throw Error('Older backup cannot contain discovery stage.');
    const key=r.type+':'+r.id;if(ids.has(key))throw Error('Duplicate record found.');ids.add(key);
    try{
      if(r.type==='keepitAssociation'){const assoc=normalizeKeepItAssociation(r.data);const logical=logicalAssociationKey(assoc);if(associationKeys.has(logical))throw Error('Duplicate logical note association');associationKeys.add(logical);}
      if(r.type==='place')normalizePlace(r.data);
      if(r.type==='trip'){normalizeTrip(r.data);if(r.data.vehicleId&&!vehicleMap.has(r.data.vehicleId))throw Error('Vehicle reference missing');}
      if(r.type==='vehicle')normalizeVehicle(r.data);
      if(r.type==='expense'){const t=tripMap.get(r.data.tripId);if(!t)throw Error('Trip reference missing');normalizeExpense(r.data,t);}
      if(r.type==='stop'){const t=tripMap.get(r.data.tripId);if(!t)throw Error('Trip reference missing');normalizeStop(r.data,t);}
      if(r.type==='packing'){const t=tripMap.get(r.data.tripId);if(!t)throw Error('Trip reference missing');normalizePacking(r.data,t);}
      if(r.type==='annotation'){if(data.schemaVersion===1)throw Error('Legacy backup cannot contain annotations.');const a=r.data;if(!['pin','line','area'].includes(a.kind)||!Array.isArray(a.points)||!a.label||a.points.length>(200)||a.points.length<(a.kind==='pin'?1:a.kind==='line'?2:3)||(a.kind==='pin'&&a.points.length!==1)||a.points.some(p=>!validCoords(p.lat,p.lng)))throw Error('Invalid map annotation');if(a.tripId&&!tripMap.has(a.tripId))throw Error('Annotation trip reference missing');}
    }catch{throw Error(`Backup record is invalid: ${r.type}`);}
  }
  const cmds=new Set();for(const o of data.outbox){
    if(!o||typeof o.commandId!=='string'||!o.commandId||cmds.has(o.commandId)||!VALID_TYPES.includes(o.entityType)||typeof o.entityId!=='string'||!['upsert','delete'].includes(o.verb)||o.state!=='LOCAL_ONLY_ADAPTER_NOT_CONNECTED')throw Error('Backup contains invalid command history.');
    cmds.add(o.commandId);
  }
  return true;
}
