/** TravelIt Batch 10: deterministic, local-only discovery and itinerary helpers.
 * These functions neither call a mapping/routing service nor perform cloud writes.
 */
export const DISCOVERY_STAGES = ['Idea','Wishlist','Planned','Visited'];
export const MAX_CALENDAR_DAYS = 366;

export function canonicalSourceUrl(source) {
  if (!source) return '';
  let u;
  try { u = new URL(source.trim()); } catch { return ''; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
  u.hostname = u.hostname.toLowerCase();
  // Keep the fragment: some map and destination URLs encode useful location data there.

  // Remove common social sharing/advertising parameters, but never geographic or functional parameters.
  for (const key of [...u.searchParams.keys()]) {
    if (/^utm_/i.test(key) || /^(fbclid|igsh|igshid|gclid|mc_cid|mc_eid)$/i.test(key)) u.searchParams.delete(key);
  }
  u.searchParams.sort();
  u.pathname = u.pathname.replace(/\/+$/, '') || '/';
  return u.toString();
}

export function findDuplicatePlace(places, sourceUrl, exceptId=null) {
  const canonical = canonicalSourceUrl(sourceUrl);
  return canonical ? places.find(p=>p.id !== exceptId && canonicalSourceUrl(p.sourceUrl) === canonical) || null : null;
}

export function dateSpan(startDate, endDate, limit=MAX_CALENDAR_DAYS) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate||'') || !/^\d{4}-\d{2}-\d{2}$/.test(endDate||'')) throw Error('Invalid trip dates.');
  const start = new Date(`${startDate}T12:00:00Z`), end = new Date(`${endDate}T12:00:00Z`);
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || end<start || start.toISOString().slice(0,10)!==startDate || end.toISOString().slice(0,10)!==endDate) throw Error('Invalid trip date range.');
  const count = Math.round((end-start)/86400000)+1;
  if (count > limit) throw Error(`Show at most ${limit} days at once.`);
  return Array.from({length:count},(_,i)=>new Date(start.getTime()+i*86400000).toISOString().slice(0,10));
}

function utcDayValue(iso) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso||'')) throw Error('Invalid calendar date.');
  const value=new Date(`${iso}T12:00:00Z`);
  if(!Number.isFinite(+value)||value.toISOString().slice(0,10)!==iso) throw Error('Invalid calendar date.');
  return value.getTime();
}
export function tripDayPosition(trip,day) {
  const start=utcDayValue(trip.startDate),end=utcDayValue(trip.endDate);
  const current=utcDayValue(day);
  return {index:Math.max(0,Math.min(Math.round((end-start)/86400000),Math.round((current-start)/86400000))),count:Math.round((end-start)/86400000)+1};
}
export function nextTripDay(day,trip,delta) {
  if(!Number.isInteger(delta)) throw Error('Day movement must be a whole number.');
  const start=utcDayValue(trip.startDate),position=tripDayPosition(trip,day);
  const index=Math.max(0,Math.min(position.count-1,position.index+delta));
  return new Date(start+index*86400000).toISOString().slice(0,10);
}
export function nearbyTripDays(trip,day,visible=7){
  if(!Number.isInteger(visible)||visible<1||visible>31) throw Error('Unsupported visible day count.');
  const {index,count}=tripDayPosition(trip,day);
  const first=Math.max(0,Math.min(index-Math.floor(visible/2),count-visible));
  const start=utcDayValue(trip.startDate);
  return Array.from({length:Math.min(visible,count)},(_,i)=>new Date(start+(first+i)*86400000).toISOString().slice(0,10));
}

export function itineraryOrder(stops) {
  return [...stops].sort((a,b)=>{
    if(a.date!==b.date) return a.date.localeCompare(b.date);
    const aTimed=!!a.time,bTimed=!!b.time;
    if(aTimed!==bTimed) return aTimed?-1:1;
    if(aTimed && a.time!==b.time) return a.time.localeCompare(b.time);
    const ax=Number.isInteger(a.sortOrder)?a.sortOrder:1000000;
    const bx=Number.isInteger(b.sortOrder)?b.sortOrder:1000000;
    return ax-bx || (a.createdAt||'').localeCompare(b.createdAt||'') || a.id.localeCompare(b.id);
  });
}

/** Reorder only time-flexible entries within the same day; never shift a clock time or fixed reservation. */
export function reorderFlexibleStops(stops,tripId,stopId,direction) {
  if (![1,-1].includes(direction)) throw Error('Direction must be +1 or -1.');
  const chosen=stops.find(s=>s.id===stopId && s.tripId===tripId);
  if(!chosen) throw Error('Activity not found in trip.');
  if(chosen.time || chosen.fixed) throw Error('Timed or fixed activities cannot be rearranged by quick order. Edit their time explicitly.');
  const group=itineraryOrder(stops.filter(s=>s.tripId===tripId && s.date===chosen.date && !s.time && !s.fixed));
  const idx=group.findIndex(s=>s.id===stopId),target=idx+direction;
  if(target<0||target>=group.length) return [];
  const newIds=group.map(s=>s.id);
  [newIds[idx],newIds[target]]=[newIds[target],newIds[idx]];
  const map=new Map(group.map(s=>[s.id,s]));
  const now=new Date().toISOString();
  return newIds.map((id,i)=>({...map.get(id),sortOrder:(i+1)*10,updatedAt:now}));
}

export function tripCalendar(trip, stops, windowStart=trip.startDate, windowEnd=trip.endDate) {
  const start=windowStart>trip.startDate?windowStart:trip.startDate;
  const end=windowEnd<trip.endDate?windowEnd:trip.endDate;
  if(end<start)return [];
  const days=dateSpan(start,end);
  const groups=new Map();
  for(const s of stops){if(s.tripId===trip.id && s.date>=start && s.date<=end){if(!groups.has(s.date))groups.set(s.date,[]);groups.get(s.date).push(s);}}
  return days.map((date,i)=>{const entries=itineraryOrder(groups.get(date)||[]);return {date,number:i+1,stops:entries,count:entries.length};});
}

export function discoveryCounts(places) {
  return Object.fromEntries(DISCOVERY_STAGES.map(stage=>[stage,places.filter(p=>(p.stage||'Idea')===stage).length]));
}
