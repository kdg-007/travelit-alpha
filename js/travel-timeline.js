/** A single source of truth for table and visual trip timeline.
 * Bar movement edits existing stop.time only, never replaces booking/leg metadata.
 */
const minutes=t=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(t||''))?
 Number(t.slice(0,2))*60+Number(t.slice(3)):null;
export function formatClock(n){if(!Number.isInteger(n)||n<0||n>=1440)throw Error('Invalid time');return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
export function timelineForDay(stops,day){
 const events=stops.filter(s=>s.date===day).map(s=>{
  const start=minutes(s.time),duration=Math.max(0,Math.min(10080,Number(s.durationMinutes)||0));
  return {id:s.id,title:s.title,kind:s.kind||'Activity',fixed:!!s.fixed,
   time:s.time||'',duration,start,end:start===null?null:start+duration,placeId:s.placeId||null};
 });
 const timed=events.filter(x=>x.start!==null);
 const untimed=events.filter(x=>x.start===null);
 const min=timed.length?Math.min(...timed.map(x=>x.start)):480;
 const max=timed.length?Math.max(...timed.map(x=>Math.min(1440,Math.max(x.end,x.start+30)))):1200;
 let begin=Math.max(0,Math.floor((min-45)/60)*60),finish=Math.min(1440,Math.ceil((max+45)/60)*60);
 if(finish-begin<240){finish=Math.min(1440,begin+240);begin=Math.max(0,finish-240);}
 return {begin,finish,span:finish-begin,
  events:timed.sort((a,b)=>a.start-b.start||String(a.id).localeCompare(String(b.id))),
  untimed};
}
export function timelinePosition(event,layout){
 const left=Math.max(0,Math.min(100,(event.start-layout.begin)/layout.span*100));
 const width=Math.max(1.5,Math.min(100-left,Math.max(15,event.duration)/layout.span*100));
 return {left,width};
}
export function shiftTimelineStop(stop,minutesDelta,trip,{snap=15}={}){
 if(!stop||!trip)throw Error('Missing activity or trip.');
 if(stop.fixed)throw Error('Fixed bookings cannot be moved on the timeline.');
 const start=minutes(stop.time);
 if(start===null)throw Error('Set a time before moving this activity.');
 if(!Number.isFinite(minutesDelta)||snap<=0)throw Error('Invalid time adjustment.');
 const newStart=start+Math.round(minutesDelta/snap)*snap;
 if(newStart<0||newStart>=1440)throw Error('Activity must remain on this day.');
 const duration=Number(stop.durationMinutes)||0;
 if(newStart+duration>1440)throw Error('Activity would extend past midnight. Edit it manually.');
 return {...stop,time:formatClock(newStart)};
}
