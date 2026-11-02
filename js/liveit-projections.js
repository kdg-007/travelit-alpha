/** Pure, non-publishing LiveIt projection drafts. No calendar client or transport exists. */
import {validDate} from './domain.js';
const idPattern=/^[A-Za-z0-9_.:-]{1,128}$/;
function requireId(id,name){if(typeof id!=='string'||!idPattern.test(id))throw Error(`Invalid ${name}.`);}
function requireRevision(revision){if(!Number.isSafeInteger(revision)||revision<0)throw Error('Missing source revision.');}
function nextDay(iso){if(!validDate(iso))throw Error('Invalid date.');const d=new Date(`${iso}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}
function safeZone(zone){if(!zone||typeof zone!=='string')throw Error('Original IANA time zone required.');try{new Intl.DateTimeFormat('en-US',{timeZone:zone});return zone;}catch{throw Error('Invalid original time zone.');}}
function safeTrip(trip){requireId(trip?.id,'trip identity');if(!validDate(trip.startDate)||!validDate(trip.endDate)||trip.endDate<trip.startDate)throw Error('Invalid trip date range.');return trip;}
export function tripSpanProjection(trip,{revision}={}){
 safeTrip(trip);requireRevision(revision);
 return {id:`trv:${trip.id}:span`,owner:'travelit',privacy:'personal',kind:'all-day-trip',tripId:trip.id,title:String(trip.title||'Trip').slice(0,150),startDate:trip.startDate,endDateExclusive:nextDay(trip.endDate),sourceRevision:revision,publishable:false,transport:'NOT_CONNECTED'};
}
/** Timed entry is eligible only if explicitly opted in with original venue provenance.
 * No fallback to the trip's time zone. A URL or a saved title is not a booking.
 */
export function timedEntryProjection(trip,entry,{revision,optIn=false,venueTimeZone=null,instant=null}={}){
 safeTrip(trip);if(!optIn)return null;
 requireRevision(revision);requireId(entry?.id,'entry identity');
 if(entry.tripId!==trip.id||!entry.fixed||!entry.time||!validDate(entry.date))throw Error('Only opted-in fixed dated entries may be projected.');
 if(entry.date<trip.startDate||entry.date>trip.endDate)throw Error('Entry is outside trip.');
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.time))throw Error('Invalid saved local time.');
 const zone=safeZone(venueTimeZone);
 if(typeof instant!=='string'||!/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(instant)||Number.isNaN(Date.parse(instant)))throw Error('Verified instant with original UTC offset required.');
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant));
 const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));const observed=`${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
 if(observed!==`${entry.date} ${entry.time}`)throw Error('Instant does not match the original venue-local date and time.');
 return {id:`trv:${trip.id}:entry:${entry.id}`,owner:'travelit',privacy:'personal',kind:'fixed-entry',tripId:trip.id,entryId:entry.id,title:String(entry.title||'Booking').slice(0,150),startInstant:new Date(instant).toISOString(),venueTimeZone:zone,originalLocal:`${entry.date}T${entry.time}`,sourceRevision:revision,publishable:false,transport:'NOT_CONNECTED'};
}
export function projectionTombstone(id,sourceRevision){
 if(typeof id!=='string'||!/^trv:[A-Za-z0-9_.:-]{1,128}:(?:span|entry:[A-Za-z0-9_.:-]{1,128})$/.test(id))throw Error('Invalid TravelIt projection key.');
 requireRevision(sourceRevision);return {id,owner:'travelit',deleted:true,sourceRevision,publishable:false,transport:'NOT_CONNECTED'};
}
export function acceptNewerProjection(existing,incoming){if(!existing)return incoming;if(existing.id!==incoming.id)throw Error('Projection identity mismatch.');if(incoming.sourceRevision<=existing.sourceRevision)return existing;return incoming;}
