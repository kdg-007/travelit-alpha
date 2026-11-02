/** Deterministic one-predecessor trip scheduling. No external routing or clock API.
 * Dates/times are floating trip-local calendar values; UTC arithmetic here only
 * measures consecutive calendar days and must not be interpreted as an instant.
 * All reflows are PROPOSALS until the consumer explicitly confirms them.
 */
const DAY=1440;
const dayNumber=date=>Math.floor(Date.parse(date+'T00:00:00Z')/86400000);
const fromDayNumber=value=>new Date(value*86400000).toISOString().slice(0,10);
const minuteOf=time=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(time||''))?
  Number(time.slice(0,2))*60+Number(time.slice(3)):null;
const tripStart=trip=>dayNumber(trip.startDate);
const tripEnd=trip=>dayNumber(trip.endDate);
export function tripMinute(stop,trip){
 const t=minuteOf(stop.time);
 if(t===null)return null;
 return (dayNumber(stop.date)-tripStart(trip))*DAY+t;
}
export function minuteToTripDate(value,trip){
 if(!Number.isSafeInteger(value)||value<0)throw Error('Schedule cannot begin before departure.');
 const day=Math.floor(value/DAY)+tripStart(trip),time=value%DAY;
 if(day>tripEnd(trip))throw Error('Schedule would continue after the trip ends.');
 return {date:fromDayNumber(day),time:String(Math.floor(time/60)).padStart(2,'0')+':'+String(time%60).padStart(2,'0')};
}
/** Validate links for every stop in a trip, including missing/cross-trip IDs. */
export function dependencyOrder(stops,tripId){
 const items=stops.filter(x=>x.tripId===tripId), byId=new Map();
 for(const s of items){
  if(!s.id||byId.has(s.id))throw Error('Duplicate or missing activity ID.');
  byId.set(s.id,s);
 }
 const state=new Map(),out=[];
 function visit(id){
  if(state.get(id)===1)throw Error('Activity dependency cycle detected.');
  if(state.get(id)===2)return;
  const s=byId.get(id);
  if(!s)throw Error('Predecessor does not exist in this trip.');
  state.set(id,1);
  if(s.predecessorId){
   if(s.predecessorId===id)throw Error('An activity cannot depend on itself.');
   if(!byId.has(s.predecessorId))throw Error('Predecessor must belong to the same trip.');
   visit(s.predecessorId);
  }
  if(!Number.isInteger(Number(s.lagMinutes??0))||Number(s.lagMinutes??0)<0||Number(s.lagMinutes??0)>1440)
   throw Error('Transfer/buffer time must be 0–1440 minutes.');
  state.set(id,2);out.push(s);
 }
 for(const s of items)visit(s.id);
 return out;
}
export function dependencyConflicts(stops,trip){
 const ordered=dependencyOrder(stops,trip.id),byId=new Map(ordered.map(s=>[s.id,s])),issues=[];
 for(const s of ordered){
  if(!s.predecessorId)continue;
  const parent=byId.get(s.predecessorId),start=tripMinute(s,trip),previous=tripMinute(parent,trip);
  if(previous===null||start===null){issues.push({id:s.id,parentId:parent.id,kind:'unscheduled',detail:'Both linked activities need start times.'});continue;}
  const earliest=previous+Number(parent.durationMinutes||0)+Number(s.lagMinutes||0);
  if(start<earliest)issues.push({id:s.id,parentId:parent.id,kind:s.fixed?'fixed-conflict':'early',minutes:earliest-start});
 }
 return issues;
}
/** Forward-only schedule adjustment. Original records are never mutated. */
export function proposeDependencyReflow(stops,trip){
 const ordered=dependencyOrder(stops,trip.id),byId=new Map(ordered.map(s=>[s.id,s]));
 const proposed=new Map(),changes=[];
 for(const s of ordered){
  if(!s.predecessorId){proposed.set(s.id,s);continue;}
  const parent=proposed.get(s.predecessorId);
  const start=tripMinute(s,trip),previous=tripMinute(parent,trip);
  if(previous===null)throw Error('Set a time for "'+parent.title+'" before reflowing its successors.');
  const duration=Number(parent.durationMinutes||0),lag=Number(s.lagMinutes||0);
  const earliest=previous+duration+lag;
  if(!Number.isSafeInteger(earliest)||earliest<0)throw Error('Invalid dependency timing.');
  if(start!==null&&start>=earliest){proposed.set(s.id,s);continue;}
  if(s.fixed)throw Error('Fixed booking "'+s.title+'" conflicts with the preceding activity. Change the plan manually.');
  const next=minuteToTripDate(earliest,trip);
  const updated={...s,...next};
  proposed.set(s.id,updated);
  changes.push({id:s.id,title:s.title,fromDate:s.date,fromTime:s.time||'',toDate:next.date,toTime:next.time,updated});
 }
 // Forward proposals still cannot push a successor beyond the trip's last night.
 for(const s of proposed.values()){
  const start=tripMinute(s,trip);
  if(start!==null&&start+Number(s.durationMinutes||0)>(tripEnd(trip)-tripStart(trip)+1)*DAY)
   throw Error('Activity "'+s.title+'" extends beyond the trip. Revise dates or duration.');
 }
 return {changes,planned:ordered.map(s=>proposed.get(s.id)),originalCount:ordered.length};
}
