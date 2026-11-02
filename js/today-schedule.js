/** TravelIt v0.23 - deterministic Today and next-stop selection.
 * Each trip is evaluated in its OWN time zone. All times are schedule estimates:
 * no road-routing, actual-arrival, or checked-in/completed state is inferred.
 */
import {tripDateAt} from './domain.js';
import {itineraryOrder} from './travel-planning.js';

export function pickTodayTrip(trips,now=new Date(),preferredTripId=null){
 if(!(now instanceof Date)||Number.isNaN(+now))throw Error('Valid current time required.');
 const eligible=trips.filter(t=>t?.startDate&&t?.endDate&&t?.timezone).map(t=>{
   const localDate=tripDateAt(now,t.timezone);
   return {...t,localDate,onTrip:t.startDate<=localDate&&localDate<=t.endDate,future:t.startDate>localDate};
 });
 const active=eligible.filter(t=>t.onTrip);
 if(active.length){
  const selected=active.find(t=>t.id===preferredTripId);
  return selected||active.sort((a,b)=>a.endDate.localeCompare(b.endDate)||a.startDate.localeCompare(b.startDate)||a.id.localeCompare(b.id))[0];
 }
 const future=eligible.filter(t=>t.future).sort((a,b)=>a.startDate.localeCompare(b.startDate)||a.id.localeCompare(b.id));
 return future[0]||null;
}

export function tripClock(now,timezone){
 if(!(now instanceof Date)||Number.isNaN(+now))throw Error('Valid current time required.');
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
 const values=Object.fromEntries(parts.filter(p=>['hour','minute'].includes(p.type)).map(p=>[p.type,p.value]));
 return `${values.hour}:${values.minute}`;
}

export function nextTodayStop(stops,clock,{onTrip=true}={}){
 const ordered=itineraryOrder(stops||[]);
 if(!onTrip)return {stop:ordered[0]||null,status:ordered.length?'departure-preview':'empty'};
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(clock))throw Error('Current trip clock must be HH:MM.');
 // An unspecified-time entry must NOT outrank a fixed 9:00 AM restaurant booking.
 const upcoming=ordered.find(s=>s.time&&s.time>=clock);
 if(upcoming)return {stop:upcoming,status:'upcoming-timed'};
 const flexible=ordered.find(s=>!s.time);
 if(flexible)return {stop:flexible,status:'flexible-unscheduled'};
 return {stop:null,status:ordered.length?'no-upcoming-scheduled':'empty'};
}
