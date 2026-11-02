import {VALID_TYPES} from './domain.js';
import {normalizeKeepItAssociation,logicalAssociationKey} from './keepit-associations.js';
import {verifyBackup} from './backup.js';
/** Local-only persistent store. The v2 upgrade adds a protected, on-device pre-restore snapshot slot. */
const NAME='travelit-foundation';const VERSION=4;
function request(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('Database request failed'));});}
function done(tx){return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||Error('Database transaction error'));tx.onabort=()=>reject(tx.error||Error('Database transaction aborted'));});}
export function openDatabase(onVersionChange=()=>{}){return new Promise((resolve,reject)=>{const req=indexedDB.open(NAME,VERSION);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('records'))db.createObjectStore('records',{keyPath:'key'});if(!db.objectStoreNames.contains('outbox'))db.createObjectStore('outbox',{keyPath:'commandId'});if(!db.objectStoreNames.contains('recovery'))db.createObjectStore('recovery',{keyPath:'id'});if(!db.objectStoreNames.contains('mapPacks'))db.createObjectStore('mapPacks',{keyPath:'id'});if(!db.objectStoreNames.contains('settings'))db.createObjectStore('settings',{keyPath:'key'});if(!db.objectStoreNames.contains('atlasRegions'))db.createObjectStore('atlasRegions',{keyPath:'id'});if(!db.objectStoreNames.contains('atlasTiles'))db.createObjectStore('atlasTiles',{keyPath:'key'});};req.onsuccess=()=>{req.result.onversionchange=()=>{req.result.close();onVersionChange();};resolve(req.result);};req.onerror=()=>reject(req.error);req.onblocked=()=>reject(Error('Close other TravelIt tabs before upgrading storage.'));});}
export async function allData(db){const tx=db.transaction(['records','outbox'],'readonly');const finished=done(tx);const recordsPromise=request(tx.objectStore('records').getAll());const outboxPromise=request(tx.objectStore('outbox').getAll());const [records,outbox]=await Promise.all([recordsPromise,outboxPromise]);await finished;return {records,outbox};}
export async function saveRecord(db,type,data,verb='upsert'){
  const commandId=globalThis.crypto.randomUUID();const tx=db.transaction(['records','outbox'],'readwrite');const finished=done(tx);
  tx.objectStore('records').put({key:`${type}:${data.id}`,type,id:data.id,data});
  tx.objectStore('outbox').put({commandId,entityType:type,entityId:data.id,verb,createdAt:new Date().toISOString(),state:'LOCAL_ONLY_ADAPTER_NOT_CONNECTED'});
  await finished;return commandId;
}
/**
 * Guarded, locally transactional edits. Historical envelopes without localRevision
 * are treated as revision zero. This is NOT cloud sync. The workspace epoch
 * changes after restore/undo so an old tab cannot recreate pre-restore records.
 */
export class StaleWorkspaceError extends Error { constructor(message){super(message);this.name='StaleWorkspaceError';this.code='STALE_LOCAL_WORKSPACE';} }
export function revisionFor(row){return Number.isSafeInteger(row?.localRevision)&&row.localRevision>=0?row.localRevision:0;}
function currentSetting(row,fallback){return row?.value??fallback;}
/** Targeted referential checks on the proposed *post-mutation* workspace. Never cascade
 * deletions implicitly. A linked place may be removed: stops preserve their title and
 * show an advisory rather than being destroyed, as specified since Batch 15.
 * Keep all relationship decisions in the records readwrite transaction.
 */
export class RelationshipError extends Error {constructor(message){super(message);this.name='RelationshipError';this.code='LOCAL_RELATIONSHIP_CONFLICT';}}
export function assertLocalRelationships(before,changes){
  const after=new Map(before.map(row=>[row.key,row]));
  for(const c of changes){const key=`${c.type}:${c.id}`;if(c.verb==='delete')after.delete(key);else after.set(key,{key,type:c.type,id:c.id,data:c.data});}
  const items=type=>[...after.values()].filter(row=>row.type===type).map(row=>row.data);
  const trips=new Map(items('trip').map(t=>[t.id,t]));
  const vehicles=new Set(items('vehicle').map(v=>v.id));
  const stopRows=items('stop'),packingRows=items('packing'),expenseRows=items('expense'),annotationRows=items('annotation');
  for(const c of changes){
    if(c.verb==='delete'&&c.type==='trip'){
      const related=[...stopRows,...packingRows,...expenseRows,...annotationRows].filter(r=>r.tripId===c.id);
      if(related.length)throw new RelationshipError(`Cannot remove this trip: ${related.length} itinerary, packing, expense or map item(s) still belong to it. Move or remove them explicitly, then retry.`);
    }
    if(c.verb==='delete'&&c.type==='vehicle'&&items('trip').some(t=>t.vehicleId===c.id))throw new RelationshipError('This vehicle is assigned to a trip. Reassign the trip before deleting the vehicle.');
    if(c.verb==='upsert'&&c.type==='trip'){
      const trip=c.data;
      if(trip.vehicleId&&!vehicles.has(trip.vehicleId))throw new RelationshipError('The assigned vehicle no longer exists. Choose an installed vehicle or clear the selection.');
      if(stopRows.some(stop=>stop.tripId===trip.id&&(stop.date<trip.startDate||stop.date>trip.endDate)) || expenseRows.some(exp=>exp.tripId===trip.id&&exp.date&&(exp.date<trip.startDate||exp.date>trip.endDate)))throw new RelationshipError('Trip date changes would strand existing itinerary activities or dated expenses. Move them within the new dates before saving.');
    }
    if(c.verb==='upsert'&&['stop','packing','expense','annotation'].includes(c.type)){
      if(!c.data.tripId){if(c.type==='annotation')continue;throw new RelationshipError('This item is missing its trip link. Refresh and select a trip before saving.');}
      const trip=trips.get(c.data.tripId);
      if(!trip)throw new RelationshipError('This trip no longer exists. Refresh and select a valid trip before saving.');
      if((c.type==='stop'||c.type==='expense')&&c.data.date&&(c.data.date<trip.startDate||c.data.date>trip.endDate))throw new RelationshipError('The dated activity or expense is outside the trip dates. Refresh and choose a valid day.');
    }
  }
  return true;
}

async function guardedMutation(db,changes,{expectedEpoch=null,expectedRevisionByKey={},expectedPresenceByKey={},expectedWorkspaceRevision=null}={}){
  if(!Array.isArray(changes)||!changes.length)return 0;
  const seen=new Set();for(const c of changes){const key=`${c.type}:${c.id}`;if(!c.type||!c.id||seen.has(key)||!['upsert','delete'].includes(c.verb))throw Error('Invalid or duplicate local edit.');seen.add(key);}
  const tx=db.transaction(['records','outbox','settings'],'readwrite'),settled=done(tx);
  try{
    const records=tx.objectStore('records'),outbox=tx.objectStore('outbox'),settings=tx.objectStore('settings');
    const [epoch,workspaceRevision,...stored]=await Promise.all([
      request(settings.get('workspace-generation')),
      request(settings.get('workspace-revision')),
      ...changes.map(c=>request(records.get(`${c.type}:${c.id}`)))
    ]);
    const actualEpoch=currentSetting(epoch,null),actualRevision=currentSetting(workspaceRevision,0);
    if(actualEpoch!==expectedEpoch)throw new StaleWorkspaceError('This workspace was restored in another tab. Your draft was not saved. Reopen the latest workspace before editing.');
    if(expectedWorkspaceRevision!==null&&actualRevision!==expectedWorkspaceRevision)throw new StaleWorkspaceError('TravelIt changed since this operation began. No records were replaced. Refresh and review before retrying.');
    // Enforce relationship invariants inside the SAME transaction as the guarded write.
    // This prevents parent deletion, stale child creation, and date edits from leaving
    // orphaned trip data that can no longer be exported as a valid TravelIt backup.
    // A deliberately unlinked destination is allowed: itinerary text remains intact.
    if(changes.some(c=>c.type==='keepitAssociation')){
      const before=await request(records.getAll());
      const after=new Map(before.map(row=>[row.key,row]));
      for(const c of changes){const key=`${c.type}:${c.id}`;if(c.verb==='delete')after.delete(key);else after.set(key,{key,type:c.type,id:c.id,data:c.data});}
      const seen=new Set();
      for(const row of after.values()){if(row.type!=='keepitAssociation')continue;const assoc=normalizeKeepItAssociation(row.data);const logical=logicalAssociationKey(assoc);if(seen.has(logical))throw new RelationshipError('An association for this record and purpose already exists.');seen.add(logical);}
      for(const c of changes){if(c.type!=='keepitAssociation'||c.verb!=='upsert')continue;const a=normalizeKeepItAssociation(c.data);if(!after.has(`${a.entityType}:${a.entityId}`))throw new RelationshipError('Cannot link a note to a missing TravelIt record. The note has not been changed.');}
    }
    if(changes.some(c=>['trip','vehicle','stop','packing','expense','annotation'].includes(c.type))){
      const before=await request(records.getAll());
      assertLocalRelationships(before,changes);
    }
    for(let i=0;i<changes.length;i++){
      const c=changes[i],key=`${c.type}:${c.id}`,row=stored[i],expected=Object.prototype.hasOwnProperty.call(expectedRevisionByKey,key)?expectedRevisionByKey[key]:0;
      if((Object.prototype.hasOwnProperty.call(expectedPresenceByKey,key) && Boolean(row)!==expectedPresenceByKey[key]) || (row?revisionFor(row):0)!==expected || (c.verb==='delete'&&!row) || (c.verb==='upsert'&&!!row&&expected===0&&revisionFor(row)===0&&c.requireAbsent)){
        throw new StaleWorkspaceError('This item has changed or was removed in another tab. Your edit was not saved. Refresh and review the latest version.');
      }
      if(c.verb==='upsert')records.put({key,type:c.type,id:c.id,data:c.data,localRevision:revisionFor(row)+1});
      else records.delete(key);
      outbox.put({commandId:globalThis.crypto.randomUUID(),entityType:c.type,entityId:c.id,verb:c.verb,createdAt:new Date().toISOString(),state:'LOCAL_ONLY_ADAPTER_NOT_CONNECTED'});
    }
    settings.put({key:'workspace-revision',value:actualRevision+1});
  }catch(error){try{tx.abort();}catch{}await settled.catch(()=>{});throw error;}
  await settled;return changes.length;
}
export async function guardedSaveRecord(db,type,data,opts={}){
 return guardedMutation(db,[{type,id:data.id,data,verb:'upsert',requireAbsent:opts.requireAbsent}],opts);
}
export async function guardedDeleteRecord(db,type,id,opts={}){
 return guardedMutation(db,[{type,id,verb:'delete'}],opts);
}
export async function guardedSaveRecords(db,type,items,opts={}){
 return guardedMutation(db,items.map(data=>({type,id:data.id,data,verb:'upsert'})),opts);
}
export async function getWorkspaceMetadata(db){
 const tx=db.transaction(['settings'],'readonly'),settled=done(tx),settings=tx.objectStore('settings');
 const [epoch,rev,mapRev]=await Promise.all([request(settings.get('workspace-generation')),request(settings.get('workspace-revision')),request(settings.get('map-revision'))]);
 await settled;return {epoch:currentSetting(epoch,null),revision:currentSetting(rev,0),mapRevision:mapVersion(mapRev)};
}
/** Atomic multi-item operation; failure aborts records AND local-only intents. */
export async function saveRecords(db,type,items){if(!items.length)return 0;const tx=db.transaction(['records','outbox'],'readwrite');const finished=done(tx);const rs=tx.objectStore('records'),os=tx.objectStore('outbox');const timestamp=new Date().toISOString();for(const data of items){rs.put({key:`${type}:${data.id}`,type,id:data.id,data});os.put({commandId:globalThis.crypto.randomUUID(),entityType:type,entityId:data.id,verb:'upsert',createdAt:timestamp,state:'LOCAL_ONLY_ADAPTER_NOT_CONNECTED'});}await finished;return items.length;}
export async function removeRecord(db,type,id){const commandId=globalThis.crypto.randomUUID();const tx=db.transaction(['records','outbox'],'readwrite');const finished=done(tx);tx.objectStore('records').delete(`${type}:${id}`);tx.objectStore('outbox').put({commandId,entityType:type,entityId:id,verb:'delete',createdAt:new Date().toISOString(),state:'LOCAL_ONLY_ADAPTER_NOT_CONNECTED'});await finished;}
/**
 * Single IDB transaction: record the existing workspace BEFORE replacing it.
 * If the recovery snapshot or replacement exceeds quota, the transaction aborts
 * and the original workspace is left unchanged.
 * The recovery slot is intentionally omitted from exported backups.
 */
export async function restore(db,backup,{expectedWorkspaceRevision=null}={}){
  // Enforce SHA-256 verification at the persistence boundary, even if a caller
  // bypasses the import UI. Legacy v1 remains explicitly unverified by design.
  const verified=await verifyBackup(backup);
  backup=verified.backup;
  const tx=db.transaction(['records','outbox','recovery','settings'],'readwrite');const finished=done(tx);const rs=tx.objectStore('records'),os=tx.objectStore('outbox'),rc=tx.objectStore('recovery'),settings=tx.objectStore('settings');
  const [priorRecords,priorOutbox,priorVersion]=await Promise.all([request(rs.getAll()),request(os.getAll()),request(settings.get('workspace-revision'))]);
  if(expectedWorkspaceRevision!==null&&(priorVersion?.value??0)!==expectedWorkspaceRevision){try{tx.abort();}catch{}await finished.catch(()=>{});throw new StaleWorkspaceError('Another tab changed the workspace before restore. Nothing was replaced. Refresh, export and review before retrying.');}
  try{
    rc.put({id:'pre-restore',savedAt:new Date().toISOString(),records:priorRecords,outbox:priorOutbox});
    rs.clear();os.clear();for(const r of backup.records)rs.put(r);for(const o of backup.outbox)os.put(o);settings.put({key:'workspace-generation',value:globalThis.crypto.randomUUID()});settings.put({key:'workspace-revision',value:(priorVersion?.value??0)+1});
  }catch(error){try{tx.abort();}catch{}await finished.catch(()=>{});throw error;}
  await finished;
}
export async function recoveryInfo(db){const tx=db.transaction(['recovery'],'readonly');const finished=done(tx);const value=await request(tx.objectStore('recovery').get('pre-restore'));await finished;return value?{savedAt:value.savedAt,records:value.records.length,outbox:value.outbox.length}:null;}
/** A local pre-restore snapshot can predate relationship guards and contain historic
 * orphaned data. Check its envelopes, unique keys, and outbox shape without
 * rejecting that recoverable legacy workspace. Never trust only array shapes.
 */
export function validRecoverySnapshot(saved){
 if(!saved||!Array.isArray(saved.records)||!Array.isArray(saved.outbox))return false;
 if(saved.records.length>150000||saved.outbox.length>300000)return false;
 const keys=new Set(), commands=new Set();
 for(const r of saved.records){
  if(!r||typeof r.type!=='string'||!VALID_TYPES.includes(r.type)||typeof r.id!=='string'||!r.id||r.key!==`${r.type}:${r.id}`||!r.data||r.data.id!==r.id||typeof r.data.updatedAt!=='string'||keys.has(r.key))return false;
  keys.add(r.key);
 }
 for(const c of saved.outbox){
  if(!c||typeof c.commandId!=='string'||!c.commandId||commands.has(c.commandId)||typeof c.entityId!=='string'||!VALID_TYPES.includes(c.entityType)||!['upsert','delete'].includes(c.verb)||c.state!=='LOCAL_ONLY_ADAPTER_NOT_CONNECTED')return false;
  commands.add(c.commandId);
 }
 return true;
}
/** Swap with pre-restore snapshot; reversible until a later restore overwrites slot. */
export async function undoRestore(db,{expectedWorkspaceRevision=null}={}){
  const tx=db.transaction(['records','outbox','recovery','settings'],'readwrite');const finished=done(tx);const rs=tx.objectStore('records'),os=tx.objectStore('outbox'),rc=tx.objectStore('recovery'),settings=tx.objectStore('settings');
  const [saved,curRecords,curOutbox,priorVersion]=await Promise.all([request(rc.get('pre-restore')),request(rs.getAll()),request(os.getAll()),request(settings.get('workspace-revision'))]);
  if(expectedWorkspaceRevision!==null&&(priorVersion?.value??0)!==expectedWorkspaceRevision){try{tx.abort();}catch{}await finished.catch(()=>{});throw new StaleWorkspaceError('Another tab changed local records. Nothing was restored. Refresh before retrying.');}
  if(!saved){tx.abort();try{await finished;}catch{}throw Error('No previous workspace snapshot is available.');}
  // Check content structurally before destructive writes; validated snapshots were created by this store.
  if(!validRecoverySnapshot(saved)) {tx.abort();try{await finished;}catch{}throw Error('Recovery snapshot is invalid. Nothing was changed.');}
  try{
    rc.put({id:'pre-restore',savedAt:new Date().toISOString(),records:curRecords,outbox:curOutbox});
    rs.clear();os.clear();for(const r of saved.records)rs.put(r);for(const o of saved.outbox)os.put(o);settings.put({key:'workspace-generation',value:globalThis.crypto.randomUUID()});settings.put({key:'workspace-revision',value:(priorVersion?.value??0)+1});
  }catch(error){try{tx.abort();}catch{}await finished.catch(()=>{});throw error;}
  await finished;return {records:saved.records.length,outbox:saved.outbox.length};
}

/** Local map data is intentionally not included in TravelIt's compact travel-data backup. */
/** All map mutations use one IndexedDB transaction and a map-specific CAS revision.
 * This applies to the atlas cells, legacy map packs and active-map selection.
 * Historical callers may omit the expected revision; the TravelIt UI must always pass it.
 */
function mapVersion(row){return Number.isSafeInteger(row?.value)&&row.value>=0?row.value:0;}
async function finishMapMutation(tx,settled,stores,expectedMapRevision,apply){
 try{
  const current=mapVersion(await request(stores.settings.get('map-revision')));
  if(expectedMapRevision!==null&&current!==expectedMapRevision)throw new StaleWorkspaceError('Offline maps changed in another TravelIt tab. Nothing was changed. Refresh the map list and retry.');
  await apply(current);
  stores.settings.put({key:'map-revision',value:current+1});
 }catch(error){try{tx.abort();}catch{}await settled.catch(()=>{});throw error;}
 await settled;
}
async function assertSelectable(stores,id){
 if(id===null||id==='__none__')return;
 const [small,region]=await Promise.all([request(stores.mapPacks.get(id)),request(stores.atlasRegions.get(id))]);
 if(!small&&!region)throw new StaleWorkspaceError('The selected offline map no longer exists. Nothing was changed. Refresh and retry.');
}
export async function listMapPacks(db){const tx=db.transaction(['mapPacks'],'readonly');const finished=done(tx);const v=await request(tx.objectStore('mapPacks').getAll());await finished;return v;}
export async function putMapPack(db,pack,{expectedMapRevision=null,activate=null,rejectExisting=false}={}){
 const tx=db.transaction(['mapPacks','atlasRegions','settings'],'readwrite'),settled=done(tx);
 const stores={mapPacks:tx.objectStore('mapPacks'),atlasRegions:tx.objectStore('atlasRegions'),settings:tx.objectStore('settings')};
 await finishMapMutation(tx,settled,stores,expectedMapRevision,async()=>{
  if(!pack?.id)throw Error('An offline map requires an ID.');
  if(rejectExisting){const [small,large]=await Promise.all([request(stores.mapPacks.get(pack.id)),request(stores.atlasRegions.get(pack.id))]);if(small||large)throw new StaleWorkspaceError('This map ID is already installed. Nothing was replaced.');}
  stores.mapPacks.put(pack);
  if(activate!==null){if(activate!==pack.id)await assertSelectable(stores,activate);stores.settings.put({key:'active-map-pack-id',value:activate});}
 });
}
export async function deleteMapPack(db,id,{expectedMapRevision=null,nextActiveId=undefined}={}){
 const tx=db.transaction(['mapPacks','atlasRegions','settings'],'readwrite'),settled=done(tx);
 const stores={mapPacks:tx.objectStore('mapPacks'),atlasRegions:tx.objectStore('atlasRegions'),settings:tx.objectStore('settings')};
 await finishMapMutation(tx,settled,stores,expectedMapRevision,async()=>{
  if(!await request(stores.mapPacks.get(id)))throw new StaleWorkspaceError('This offline map was removed in another tab. Nothing was changed.');
  stores.mapPacks.delete(id);
  if(nextActiveId!==undefined){if(nextActiveId===id)throw Error('Cannot select a deleted map.');await assertSelectable(stores,nextActiveId);stores.settings.put({key:'active-map-pack-id',value:nextActiveId??'__none__'});}
 });
}
export async function setActiveMapPack(db,id,{expectedMapRevision=null}={}){
 const tx=db.transaction(['mapPacks','atlasRegions','settings'],'readwrite'),settled=done(tx);
 const stores={mapPacks:tx.objectStore('mapPacks'),atlasRegions:tx.objectStore('atlasRegions'),settings:tx.objectStore('settings')};
 await finishMapMutation(tx,settled,stores,expectedMapRevision,async()=>{
  await assertSelectable(stores,id);stores.settings.put({key:'active-map-pack-id',value:id??'__none__'});
 });
}
export async function getSetting(db,key){const tx=db.transaction(['settings'],'readonly');const finished=done(tx);const value=await request(tx.objectStore('settings').get(key));await finished;return value?.value??null;}
export async function setSetting(db,key,value){const tx=db.transaction(['settings'],'readwrite');const finished=done(tx);tx.objectStore('settings').put({key,value});await finished;}

/** Region/tile tables remain separate from the small-map and travel-data stores.
 * Atomic import: no atlasRegion becomes visible if any tile write aborts.
 */
export async function listAtlasRegions(db){const tx=db.transaction(['atlasRegions'],'readonly');const finished=done(tx);const rows=await request(tx.objectStore('atlasRegions').getAll());await finished;return rows;}
export async function putAtlasRegion(db,manifest,tiles,{expectedMapRevision=null,activate=null,rejectExisting=false}={}){
 if(!manifest?.regionAtlas||!Array.isArray(tiles)||tiles.length!==manifest.tileCount)throw Error('Incomplete regional atlas import.');
 const tx=db.transaction(['atlasRegions','atlasTiles','mapPacks','settings'],'readwrite'),settled=done(tx);
 const stores={atlasRegions:tx.objectStore('atlasRegions'),atlasTiles:tx.objectStore('atlasTiles'),mapPacks:tx.objectStore('mapPacks'),settings:tx.objectStore('settings')};
 await finishMapMutation(tx,settled,stores,expectedMapRevision,async()=>{
  if(rejectExisting){const [small,large]=await Promise.all([request(stores.mapPacks.get(manifest.id)),request(stores.atlasRegions.get(manifest.id))]);if(small||large)throw new StaleWorkspaceError('This regional atlas ID is already installed. Nothing was overwritten.');}
  for(const tile of tiles)stores.atlasTiles.put(tile);
  stores.atlasRegions.put(manifest);
  if(activate!==null){if(activate!==manifest.id)await assertSelectable(stores,activate);stores.settings.put({key:'active-map-pack-id',value:activate});}
 });
}
export async function getAtlasTiles(db,regionId,descriptors){
 if(!descriptors.length)return [];
 const tx=db.transaction(['atlasTiles'],'readonly'),finished=done(tx),store=tx.objectStore('atlasTiles');
 const rows=await Promise.all(descriptors.map(d=>request(store.get(`${regionId}:${d.tileId}`))));await finished;return rows;
}
export async function deleteAtlasRegion(db,region,{expectedMapRevision=null,nextActiveId=undefined}={}){
 if(!region?.regionAtlas||!Array.isArray(region.tiles))throw Error('Invalid region for removal.');
 const tx=db.transaction(['atlasRegions','atlasTiles','mapPacks','settings'],'readwrite'),settled=done(tx);
 const stores={atlasRegions:tx.objectStore('atlasRegions'),atlasTiles:tx.objectStore('atlasTiles'),mapPacks:tx.objectStore('mapPacks'),settings:tx.objectStore('settings')};
 await finishMapMutation(tx,settled,stores,expectedMapRevision,async()=>{
  const current=await request(stores.atlasRegions.get(region.id));
  if(!current)throw new StaleWorkspaceError('This regional atlas was removed in another tab. No map data was changed.');
  // Use the authoritative stored tile list: a stale UI manifest must never leave orphan cells.
  if(!Array.isArray(current.tiles))throw Error('Stored regional atlas descriptor is damaged; removal blocked.');
  for(const tile of current.tiles)stores.atlasTiles.delete(`${region.id}:${tile.tileId}`);
  stores.atlasRegions.delete(region.id);
  if(nextActiveId!==undefined){if(nextActiveId===region.id)throw Error('Cannot select a deleted map.');await assertSelectable(stores,nextActiveId);stores.settings.put({key:'active-map-pack-id',value:nextActiveId??'__none__'});}
 });
}
