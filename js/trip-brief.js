/** TravelIt Batch 26 — plain-text, one-way itinerary snapshots. No cloud, routing, or document export. */
import {validCoords,wazeUrl,validDate} from './domain.js';
import {itineraryOrder} from './travel-planning.js';
import {tripCostSummary} from './trip-costs.js';
const oneLine=(value,max=500)=>String(value??'').replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const php=v=>`PHP ${Math.round(v*100)/100}`;
const tripDate=d=>String(d||'').replace(/-/g,'');
const safeFilename=v=>oneLine(v,70).replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-|-$/g,'')||'trip';
const days=(start,end)=>Math.round((Date.parse(end+'T12:00:00Z')-Date.parse(start+'T12:00:00Z'))/86400000)+1;
const countBy=(items,pred)=>items.filter(pred).length;

/**
 * Creates an explicit snapshot. It is NEVER a KeepIt/LiveIt sync or a secure document export.
 * Notes, source reels, contact data, and files are excluded to avoid accidental disclosure.
 */
export function makeTripBrief({trip,stops=[],places=[],packing=[],expenses=[],vehicle=null,scope='trip',date=null}){
 if(!trip?.id||!validDate(trip.startDate)||!validDate(trip.endDate)||trip.endDate<trip.startDate)throw Error('Select a valid trip first.');
 if(!['trip','day'].includes(scope))throw Error('Invalid trip brief scope.');
 if(scope==='day'&&(!validDate(date)||date<trip.startDate||date>trip.endDate))throw Error('Day must fall within the selected trip.');
 if(![stops,places,packing,expenses].every(Array.isArray))throw Error('Invalid trip brief records.');
 const records=itineraryOrder(stops.filter(s=>s?.tripId===trip.id&&(scope==='trip'||s.date===date)));
 if(records.length>3000)throw Error('Trip brief is too large. Download individual days instead.');
 const loc=new Map(places.filter(p=>p?.id).map(p=>[p.id,p]));
 const lines=[`TRAVELIT — ${oneLine(trip.title,150)}`,scope==='trip'?`${trip.startDate} to ${trip.endDate}`:date,`Trip time zone: ${oneLine(trip.timezone,100)}`,`Local snapshot • Not synced to KeepIt or LiveIt`,`Driving distance, time, tolls, and cost estimates are manually entered, NOT verified routing.`,``];
 const dateList=scope==='day'?[date]:(()=>{
  const n=days(trip.startDate,trip.endDate);
  if(n<=31)return Array.from({length:n},(_,i)=>new Date(Date.parse(trip.startDate+'T12:00:00Z')+i*86400000).toISOString().slice(0,10));
  return [...new Set(records.map(s=>s.date).filter(d=>d>=trip.startDate&&d<=trip.endDate))].sort();
 })();
 if(scope==='trip'&&days(trip.startDate,trip.endDate)>31)lines.push('Long trip: only dates with saved activities are listed.','');
 for(const d of dateList){
  const entries=records.filter(s=>s.date===d);
  const n=Math.round((Date.parse(d+'T12:00:00Z')-Date.parse(trip.startDate+'T12:00:00Z'))/86400000)+1;
  lines.push(`DAY ${n} — ${d}`,`${entries.length} saved activities`);
  if(!entries.length)lines.push('  No activities entered.');
  for(const [idx,s] of entries.entries()){
   const place=loc.get(s.placeId),hasPin=place&&validCoords(place.lat,place.lng);
   lines.push(`  ${idx+1}. ${s.time||'Flexible'} | ${oneLine(s.title,150)}${s.fixed?' [fixed]':''}`);
   const details=[];
   if(s.kind)details.push(oneLine(s.kind,30));
   if(s.durationMinutes>0)details.push(`${s.durationMinutes} min activity`);
   if(place?.name&&place.name!==s.title)details.push(`at ${oneLine(place.name,150)}`);
   if(details.length)lines.push(`     ${details.join(' · ')}`);
   const road=[];
   if(Number.isFinite(s.legDistanceKm))road.push(`${s.legDistanceKm} km`);
   if(Number.isInteger(s.legTravelMinutes))road.push(`${s.legTravelMinutes} min`);
   if(Number.isFinite(s.legTollPhp))road.push(php(s.legTollPhp)+' toll');
   if(road.length)lines.push(`     Incoming drive (entered): ${road.join(' · ')}`);
   if(hasPin)lines.push(`     Waze: ${wazeUrl(place)}`);
   else lines.push('     Navigation: no verified pinned coordinates');
  }
  lines.push('');
 }
 if(scope==='trip'){
  const pack=packing.filter(p=>p?.tripId===trip.id);
  const unpacked=pack.filter(p=>!p.packed);
  lines.push(`PACKING — ${countBy(pack,p=>p.packed)}/${pack.length} checked`);
  if(unpacked.length>300)lines.push(`${unpacked.length} unpacked entries; open TravelIt for the complete packing checklist.`);
  else if(unpacked.length)unpacked.forEach(p=>lines.push(`  [ ] ${oneLine(p.label,150)}${p.quantity>1?` x${p.quantity}`:''}${p.owner?` (${oneLine(p.owner,80)})`:''}`));
  else lines.push(pack.length?'All saved packing entries are checked.':'No packing items saved.');
  lines.push('');
  const costs=tripCostSummary({trip,stops:records,expenses:expenses.filter(e=>e?.tripId===trip.id),vehicle});
  lines.push('BUDGET — manual planning inputs',`Known planned subtotal: ${php(costs.plannedSubtotal)} (PARTIAL if inputs unknown)`, `Known distance: ${costs.distanceKm} km; ${costs.unknownDistanceCount} activity/leg entries without a distance`);
  if(costs.fuelConfigured)lines.push(`Calculated fuel estimate incl. ${costs.reserve}% reserve: ${php(costs.fuelPhp)}`);
  else lines.push('Fuel estimate: unknown — configure a vehicle, economy, and fuel price.');
  if(!costs.estimateComplete)lines.push('Warning: missing values mean this is NOT a complete trip budget.');
  lines.push('');
 }
 lines.push('This plain-text export contains no travel documents, private notes, original social links, or photos.','Navigation links may need an internet connection and the navigation app.','Keep a separate verified TravelIt backup; this text is NOT a restorable backup.');
 const suffix=scope==='day'?`_${tripDate(date)}`:'_full-trip';
 return {text:lines.join('\n')+'\n',filename:`TravelIt_${safeFilename(trip.title)}${suffix}.txt`,entryCount:records.length,scope};
}
