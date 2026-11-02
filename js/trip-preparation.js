/** TravelIt v0.27.0 — derived trip-preparation review, not an attestation.
 * No new persistent checklist, documents, reservations or cloud claims are created.
 * All results are conservative and traceable to local user-entered records.
 */
import {validCoords,conflicts} from './domain.js';
import {travelFeasibility} from './trip-costs.js';

export function reviewTripPreparation({trip,stops=[],places=[],packing=[],expenses=[],vehicle=null,shellReport=null,mapPacks=[],storageHealth=null}={}) {
 if(!trip?.id) return {tripId:null,items:[],counts:{ok:0,attention:0,unverified:0},complete:false,hasCriticalGaps:true};
 const items=[];
 const add=(id,label,status,detail,action=null)=>items.push({id,label,status,detail,action});
 const savedStops=stops.filter(x=>x.tripId===trip.id);
 const packed=packing.filter(x=>x.tripId===trip.id);
 const costs=expenses.filter(x=>x.tripId===trip.id);
 const placesById=new Map(places.map(x=>[x.id,x]));
 const missingPins=savedStops.filter(s=>s.placeId && !validCoords(placesById.get(s.placeId)?.lat,placesById.get(s.placeId)?.lng));
 const travelWithoutLocation=savedStops.filter(s=>!s.placeId && ['Travel','Hotel','Meal'].includes(s.kind));
 const fixedWithoutTime=savedStops.filter(s=>s.fixed&&!s.time);
 const itineraryClashes=conflicts(savedStops);
 const transferIssues=travelFeasibility(savedStops).filter(x=>x.kind==='insufficient-transfer-time');
 if(!savedStops.length)add('schedule','Itinerary','attention','No travel activities have been added.','itinerary');
 else if(fixedWithoutTime.length || itineraryClashes.length || transferIssues.length)
  add('schedule','Itinerary','attention',`${fixedWithoutTime.length} fixed commitment(s) without a start time; ${itineraryClashes.length} overlapping pair(s); ${transferIssues.length} insufficient transfer(s).`,'itinerary');
 else add('schedule','Itinerary','ok',`${savedStops.length} saved activities; no detected schedule overlaps. Travel times remain user estimates.`,'itinerary');
 if(missingPins.length||travelWithoutLocation.length)
  add('pins','Destination pins','attention',`${missingPins.length} linked place(s) missing valid coordinates; ${travelWithoutLocation.length} meal/hotel/travel stop(s) without a saved place.`, 'places');
 else if(savedStops.length)add('pins','Destination pins','ok','All linked places have coordinates; flexible activities may intentionally have no pin.','places');
 else add('pins','Destination pins','unverified','No itinerary destinations to verify yet.','places');
 if(!packed.length)add('packing','Packing checklist','attention','No packing list created for this trip.','packing');
 else {const count=packed.filter(x=>!x.packed).length;
  add('packing','Packing checklist',count?'attention':'ok',count?`${count} of ${packed.length} item(s) still unchecked.`:`All ${packed.length} saved packing items are checked. This does not prove nothing was forgotten.`,'packing');}
 const drives=savedStops.filter(s=>s.legDistanceKm!==null&&s.legDistanceKm!==undefined);
 const withoutTime=drives.filter(s=>s.legTravelMinutes===null||s.legTravelMinutes===undefined);
 if(drives.length){
  if(withoutTime.length)add('driving','Driving legs','attention',`${withoutTime.length} of ${drives.length} entered drive(s) have no travel-time estimate. No routing engine is connected.`,'itinerary');
  else add('driving','Driving legs','ok',`${drives.length} entered drive(s) have manually supplied time estimates, not verified routing.`,'itinerary');
  const fuelConfigured=Boolean(vehicle&&Number(vehicle.kmPerLiter)>0&&vehicle.fuelPricePhp!==null&&Number.isFinite(Number(vehicle.fuelPricePhp)));
  add('fuel','Vehicle and fuel',''+(fuelConfigured?'ok':'attention'),fuelConfigured?'Fuel inputs present; estimates remain manually supplied assumptions.':'Add a vehicle profile with fuel economy and price to estimate fuel cost.','budget');
 }else{
  add('driving','Driving and transport','unverified','No driving legs entered. Transport or flights may be planned outside TravelIt.','itinerary');
 }
 if(!costs.length)add('budget','Trip expenses','attention','No accommodation, food, or activity cost items entered.','budget');
 else{const unknown=costs.filter(x=>x.plannedPhp===null||x.plannedPhp===undefined).length;
  add('budget','Trip expenses',unknown?'attention':'ok',unknown?`${unknown} of ${costs.length} cost item(s) have no planned amount.`:`${costs.length} costs entered; actual prices and reservations are not verified.`,'budget');}
 add('app-cache','Offline application',shellReport?.ready===true?'ok':'unverified',shellReport?.ready===true?'Current application-shell files checked in browser cache; device persistence is not guaranteed.':'Offline shell has not passed its cache verification on this device.','offline');
 const hasReferenceMap=mapPacks.some(p=>p && (p.regionAtlas || p.dataProfile || p.type || p.featureCount));
 add('offline-map','Offline map', 'unverified',hasReferenceMap?'A local reference map is installed, but it is NOT offline road navigation.':'No locally verified geographic reference map. Waze requires its own connectivity and map availability.','offline');
 add('documents','Travel documents','unverified','Passport, IDs, tickets and confirmations cannot be verified here; use a trusted secure wallet until KeepIt integration is approved.',null);
 add('backup','External backup','unverified','No external backup recovery has been verified. Export a TravelIt backup and keep a copy outside this browser.','offline');
 if(storageHealth?.ok===true)add('storage','Storage readback','ok','A temporary local write/readback succeeded; this does not guarantee long-term device retention.','offline');
 else add('storage','Storage readback','unverified','Run Local Data Diagnostics to check this browser’s immediate write/readback.','offline');
 const counts={ok:0,attention:0,unverified:0};for(const x of items)counts[x.status]++;
 return {tripId:trip.id,items,counts,complete:counts.attention===0&&counts.unverified===0,hasCriticalGaps:counts.attention>0};
}
