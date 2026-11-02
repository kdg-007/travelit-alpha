import {normalizeKeepItAssociation,logicalAssociationKey} from './keepit-associations.js';
/** TravelIt local-only diagnostics. No cloud calls, tokens, or destructive data mutations. */
import {validDate,validCoords,VALID_TYPES} from './domain.js';

/** Read-only audit of the current local records, not a substitute for backup verification. */
export function auditWorkspace(data){
  if(!data||!Array.isArray(data.records)||!Array.isArray(data.outbox))throw Error('Invalid workspace snapshot.');
  const issues=[],keys=new Set(),byType={};
  const warn=(code,entity,detail,severity='warning')=>issues.push({code,entity,detail,severity});
  for(const r of data.records){
    if(!r||!VALID_TYPES.includes(r.type)||typeof r.id!=='string'||r.key!==`${r.type}:${r.id}`||!r.data||r.data.id!==r.id){warn('MALFORMED_RECORD',r?.key||'(unknown)','Invalid record envelope','error');continue;}
    if(keys.has(r.key))warn('DUPLICATE_RECORD',r.key,'Duplicate persistent record key','error');
    keys.add(r.key);(byType[r.type]??=[]).push(r.data);
  }
  const index=t=>new Map((byType[t]||[]).map(r=>[r.id,r]));
  const trips=index('trip'),places=index('place'),vehicles=index('vehicle');
  for(const trip of trips.values()){
    if(!validDate(trip.startDate)||!validDate(trip.endDate)||trip.endDate<trip.startDate)warn('TRIP_DATE',trip.id,'Trip dates invalid','error');
    if(trip.vehicleId&&!vehicles.has(trip.vehicleId))warn('MISSING_VEHICLE',trip.id,'Assigned vehicle is missing','error');
  }
  for(const t of ['stop','packing','expense','annotation'])for(const r of byType[t]||[]){
    if(r.tripId&&!trips.has(r.tripId))warn('MISSING_TRIP',`${t}:${r.id}`,'Referenced trip no longer exists','error');
    if(t==='stop'){
      const trip=trips.get(r.tripId);
      if(trip&&(r.date<trip.startDate||r.date>trip.endDate||!validDate(r.date)))warn('STOP_OUTSIDE_TRIP',r.id,'Activity date outside trip','error');
      // Place deletion intentionally preserves itinerary text; show an advisory, never delete stop.
      if(r.placeId&&!places.has(r.placeId))warn('MISSING_PLACE_PIN',r.id,'Activity retains its title but has no linked destination pin');
    }
  }
  // External KeepIt identities are never repaired/deleted by read-only diagnostics.
  // A missing TravelIt parent or unavailable native host is an external dependency warning,
  // not proof the KeepIt native note has been deleted or corrupted.
  const seenAssociations=new Set();
  for(const a of byType.keepitAssociation||[]){
    try{
      const assoc=normalizeKeepItAssociation(a),logical=logicalAssociationKey(assoc);
      if(seenAssociations.has(logical))warn('DUPLICATE_KEEPIT_ASSOCIATION',a.id,'Multiple local links claim one entity/purpose','error');
      seenAssociations.add(logical);
      if(!(byType[assoc.entityType]||[]).some(e=>e.id===assoc.entityId))warn('KEEPIT_PARENT_UNAVAILABLE',a.id,'External native reference preserved; the TravelIt parent was removed');
      warn('KEEPIT_NATIVE_NOT_VERIFIED',a.id,'Only the native reference is stored locally. Note content/OneDrive status cannot be checked.');
    }catch{warn('INVALID_KEEPIT_ASSOCIATION',a?.id||'(unknown)','Malformed scoped native reference','error');}
  }
  for(const p of places.values()){
    const partial=(p.lat===null||p.lat===undefined)!==(p.lng===null||p.lng===undefined);
    if(partial||(p.lat!==null&&p.lat!==undefined&&!validCoords(p.lat,p.lng)))warn('INVALID_PLACE_PIN',p.id,'Incomplete or invalid destination coordinates','error');
  }
  const commands=new Set();for(const c of data.outbox){
    if(!c||typeof c.commandId!=='string'||!c.commandId||commands.has(c.commandId))warn('DUPLICATE_COMMAND',c?.commandId||'(missing)','Malformed or duplicate local command','error');
    else commands.add(c.commandId);
    if(c&&c.state!=='LOCAL_ONLY_ADAPTER_NOT_CONNECTED')warn('UNEXPECTED_COMMAND_STATE',c.commandId,'Unexpected local-only integration state','error');
  }
  return {recordCount:data.records.length,commandCount:data.outbox.length,issues,errors:issues.filter(i=>i.severity==='error').length,warnings:issues.filter(i=>i.severity==='warning').length,checkedAt:new Date().toISOString()};
}

/** Tests actual IndexedDB settings writes and readback without touching travel records. */
export async function storageReadbackProbe(db,id){
  if(!db?.transaction)throw Error('IndexedDB not available.');
  const token=id||`health-${globalThis.crypto.randomUUID()}`;
  const key=`__travelit_probe__:${token}`;
  const marker={key,value:{token,nonce:globalThis.crypto.randomUUID()}};
  const req=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||Error('IndexedDB request failed'));});
  const complete=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('IndexedDB transaction aborted'));tx.onerror=()=>reject(tx.error||Error('IndexedDB transaction error'));});
  let wrote=false,read=false;
  try{
    {const tx=db.transaction(['settings'],'readwrite');const settled=complete(tx);tx.objectStore('settings').put(marker);await settled;wrote=true;}
    {const tx=db.transaction(['settings'],'readonly');const settled=complete(tx);const saved=await req(tx.objectStore('settings').get(key));await settled;read=saved?.value?.nonce===marker.value.nonce;}
    if(!read)throw Error('Local storage readback did not match the written diagnostic value.');
    return {ok:true,wrote,read,scope:'this-browser-database-only'};
  }finally{
    // Always try to delete the temporary marker; never clear or overwrite user records.
    try{const tx=db.transaction(['settings'],'readwrite');const settled=complete(tx);tx.objectStore('settings').delete(key);await settled;}catch{/* report original failure; orphan probe can be safely ignored */}
  }
}
