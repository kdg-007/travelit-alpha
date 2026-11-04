/** Native TravelIt notes: self-contained local Markdown, not a KeepIt cloud receipt.
 * Note content is stored with the record and therefore included in exported backups.
 */
const limit=(v,n)=>String(v??'').slice(0,n);
export const NOTE_TARGETS=['general','trip','place','stop'];
export const NOTE_FORMAT='markdown-lite-v1';
export function normalizeLocalNote(input,now=new Date().toISOString()){
 const id=String(input.id||globalThis.crypto?.randomUUID?.()||('note_'+Date.now()));
 if(!/^[A-Za-z0-9_-]{3,120}$/.test(id))throw Error('Invalid note identifier.');
 const title=limit(input.title,160).trim()||'Untitled note';
 const content=limit(input.content,100001);
 if(content.length>100000)throw Error('Notes must be 100,000 characters or fewer.');
 const targetType=NOTE_TARGETS.includes(input.targetType)?input.targetType:'general';
 const targetId=targetType==='general'?null:String(input.targetId||'').trim();
 if(targetType!=='general'&&!targetId)throw Error('Choose the trip, place or activity for this note.');
 if(targetId&&targetId.length>120)throw Error('Invalid note association.');
 const createdAt=String(input.createdAt||now);
 if(!Number.isFinite(Date.parse(createdAt)))throw Error('Invalid note creation date.');
 return {id,title,content,format:NOTE_FORMAT,targetType,targetId,
   createdAt,updatedAt:now,origin:'travelit-local'};
}
/** Safe Markdown subset: do not accept or interpret HTML, scripts or remote embeds. */
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function inline(s){
 const safe=escapeHTML(s);
 return safe.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
  .replace(/(^|[^\w])\*(.+?)\*/g,'$1<em>$2</em>')
  .replace(/\x60([^\x60]+)\x60/g,'<code>$1</code>');
}
export function previewNote(content){
 const lines=String(content??'').split(/\r?\n/);
 let result=[],inList=false;
 const close=()=>{if(inList){result.push('</ul>');inList=false;}};
 for(const raw of lines.slice(0,1500)){
  const s=raw.trim();
  if(!s){close();continue;}
  const heading=/^(#{1,3})\s+(.+)$/.exec(s);
  if(heading){close();const h=heading[1].length;result.push('<h'+h+'>'+inline(heading[2])+'</h'+h+'>');continue;}
  const list=/^[-*]\s+(.+)$/.exec(s);
  if(list){if(!inList){result.push('<ul>');inList=true;}result.push('<li>'+inline(list[1])+'</li>');continue;}
  close();result.push('<p>'+inline(s)+'</p>');
 }
 close();return result.join('');
}
export function linkedNotes(notes,targetType,targetId){
 return notes.filter(n=>n.targetType===targetType&&n.targetId===targetId)
   .sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
}
