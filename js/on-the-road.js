/** TravelIt Batch 28 — deterministic, read-only on-the-road queue.
 * This list is only a view of saved itinerary data, never GPS arrival/completion,
 * live route planning, verified driving time or cloud synchronization.
 */
import {itineraryOrder} from './travel-planning.js';
import {wazeUrl} from './domain.js';

export function buildOnTheRoadQueue({stops=[],places=[],clock='00:00',onTrip=true,maxItems=4}={}){
 if(!Array.isArray(stops)||!Array.isArray(places))throw Error('Saved itinerary and places are required.');
 if(onTrip && !/^([01]\d|2[0-3]):[0-5]\d$/.test(clock))throw Error('Trip clock must be HH:MM.');
 if(!Number.isInteger(maxItems)||maxItems<1||maxItems>10)throw Error('Invalid quick-stop limit.');
 const byId=new Map(places.filter(p=>p?.id).map(p=>[p.id,p]));
 const ordered=itineraryOrder(stops.filter(s=>s&&typeof s.id==='string'));
 const timed=ordered.filter(s=>s.time&&(!onTrip||s.time>=clock));
 const untimed=ordered.filter(s=>!s.time);
 const earlierCount=onTrip?ordered.filter(s=>s.time&&s.time<clock).length:0;
 const visible=[...timed,...untimed].slice(0,maxItems).map(s=>{
   const place=s.placeId?byId.get(s.placeId):null;
   const navUrl=place?wazeUrl(place):null;
   const sourceUrl=place&&typeof place.sourceUrl==='string'&&/^https?:\/\//i.test(place.sourceUrl)?place.sourceUrl:null;
   const legDistanceKm=Number.isFinite(s.legDistanceKm)&&s.legDistanceKm>=0?s.legDistanceKm:null;
   const legTravelMinutes=Number.isFinite(s.legTravelMinutes)&&s.legTravelMinutes>=0?s.legTravelMinutes:null;
   return {
     id:s.id,title:s.title||'Untitled activity',time:s.time||null,kind:s.kind||'Activity',
     fixed:Boolean(s.fixed),navUrl,sourceUrl,placeName:place?.name||null,
     pinStatus:navUrl?'pinned':s.placeId?'missing-or-unpinned':'no-associated-place',
     scheduleStatus:!onTrip?'departure-preview':s.time?'upcoming-timed':s.fixed?'fixed-time-missing':'flexible-time',
     legDistanceKm,legTravelMinutes,
   };
 });
 return {items:visible,earlierTimedCount:earlierCount,remainingCount:timed.length+untimed.length,
    omittedCount:Math.max(0,timed.length+untimed.length-visible.length),
    disclaimer:'Saved schedule only. Times and driving legs are not live routing, actual arrivals or completion status.'};
}
