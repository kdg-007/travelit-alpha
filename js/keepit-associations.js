/** TravelIt-owned associations ONLY; KeepIt is the exclusive native note writer.
 * This module does not connect to KeepIt or prove native/cloud persistence.
 * Existing ThinkIt v1 reference fields retain their meaning unchanged.
 */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const scopePattern=/^sha256:[a-f0-9]{64}$/;
const localId=/^[A-Za-z0-9_.:-]{1,128}$/;
const allowed=new Set(['id','appId','workspaceId','entityType','entityId','purpose','reference','createdAt','updatedAt']);
const isIso=s=>typeof s==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(s) && !Number.isNaN(Date.parse(s));
export const KEEPIT_CONNECTION=Object.freeze({available:false,status:'NOT_CONNECTED',canOpenNotes:false,canWriteNotes:false,canPreviewDocuments:false,canSync:false,reason:'No approved TravelIt host or authorization has been installed.'});
export function keepItConnectionStatus(){return KEEPIT_CONNECTION;}
export function validateKeepItReference(reference){
 if(!reference||typeof reference!=='object'||Array.isArray(reference)||Object.keys(reference).sort().join(',')!=='itemId,provider,revision,scope,version')throw Error('Expected exact KeepIt reference-v1 envelope.');
 if(reference.provider!=='keepit'||reference.version!==1||!scopePattern.test(reference.scope)||!uuid.test(reference.itemId)||!Number.isSafeInteger(reference.revision)||reference.revision<0)throw Error('Invalid KeepIt native reference identity or revision.');
 return true;
}
export function normalizeKeepItAssociation(input,{now='2026-10-30T00:00:00Z'}={}){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!allowed.has(k)))throw Error('Association contains unsupported fields or sensitive content.');
 if(!uuid.test(input.id||''))throw Error('Association ID must be a stable UUID.');
 if(input.appId!=='travelit'||!localId.test(input.workspaceId||'')||!['trip','place','stop'].includes(input.entityType)||!localId.test(input.entityId||'')||input.purpose!=='rich-note')throw Error('Unsupported TravelIt association identity or purpose.');
 validateKeepItReference(input.reference);
 const createdAt=input.createdAt||now,updatedAt=input.updatedAt||now;
 if(!isIso(createdAt)||!isIso(updatedAt))throw Error('Invalid association timestamps.');
 return {id:input.id,appId:'travelit',workspaceId:input.workspaceId,entityType:input.entityType,entityId:input.entityId,purpose:'rich-note',reference:{...input.reference},createdAt,updatedAt};
}
export function logicalAssociationKey(a){return JSON.stringify([a.appId,a.workspaceId,a.entityType,a.entityId,a.purpose]);}
/** Identity link is not permission, native availability, or cloud readback. */
export function associationAvailability(association,existingEntities){
 normalizeKeepItAssociation(association);
 const exists=existingEntities.some(e=>e.type===association.entityType&&e.id===association.entityId);
 return {status:exists?'REFERENCE_ONLY_NOT_CONNECTED':'ORPHANED_REFERENCE_PRESERVED',canOpen:false,canDeleteNative:false};
}
export function copyAssociation(source,target,{mode,associationId,verifiedIndependentReference=null,now='2026-10-30T00:00:00Z'}={}){
 normalizeKeepItAssociation(source);
 if(mode==='omit')return null;
 if(!['share','independent'].includes(mode))throw Error('Explicit association-copy policy is required.');
 if(!target||!['trip','place','stop'].includes(target.entityType)||!localId.test(target.entityId||''))throw Error('Invalid association copy target.');
 if(!uuid.test(associationId||'')||associationId===source.id)throw Error('Copy needs a new stable association ID.');
 if(mode==='independent')throw Error('Independent native copy is disabled until an authorized KeepIt host returns a verified copy receipt.');
 if(verifiedIndependentReference)throw Error('Shared link cannot also claim an independent copy.');
 return normalizeKeepItAssociation({...source,id:associationId,entityType:target.entityType,entityId:target.entityId,reference:source.reference,createdAt:now,updatedAt:now});
}
/** Status only: never fabricate a host, iframe postMessage channel, URL, or Microsoft token. */
export function openKeepItNote(){return {ok:false,status:'NOT_CONNECTED',message:KEEPIT_CONNECTION.reason};}
