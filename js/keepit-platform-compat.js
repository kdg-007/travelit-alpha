/** TravelIt ↔ KeepIt Platform v1 reference compatibility only.
 * NOT a KeepIt connection, token adapter, library writer, or provider authorization.
 * The native-note host returns an untyped reference; generic Platform v1
 * associations require a provider-issued, typed {kind:'note'} reference.
 * Only KeepIt's trusted provider may construct an authorized typed reference.
 */
import {validateKeepItReference} from './keepit-associations.js';

export const KEEPIT_PLATFORM_ALIGNMENT=Object.freeze({
 contractMajor:1,
 provider:'keepit',
 transport:'keepit-owned-same-origin-in-process',
 enabled:false,
 runtimeHostInstalled:false,
 nativeNoteGrant:'notes.native',
 bridgeStatus:'PROVIDER_NOT_CONNECTED',
 cloudVerified:false,
 authoritativeNoteWriter:'keepit',
 travelitLocalNoteRole:'offline-capture-not-cloud-sync'
});

/** Structural validation; not an access grant or independent cloud readback. */
export function validateKeepItTypedReference(ref){
 if(!ref||typeof ref!=='object'||Array.isArray(ref)||
   Object.keys(ref).sort().join(',')!=='itemId,kind,provider,revision,scope,version') {
  throw Error('Expected exact provider-issued Platform v1 typed reference.');
 }
 if(!['note','file'].includes(ref.kind))throw Error('Unsupported KeepIt reference kind.');
 if(!Number.isSafeInteger(ref.revision)||ref.revision<1) {
  throw Error('Platform v1 typed reference requires a positive revision.');
 }
 validateKeepItReference({
  provider:ref.provider,version:ref.version,scope:ref.scope,
  itemId:ref.itemId,revision:ref.revision
 });
 return true;
}

/** A pure correspondence check: the caller must already have a trusted provider
 * resolution. It does not create the typed reference or grant app access.
 * Legacy native refs must not be passed blindly into generic file association APIs.
 */
export function assertNativeAndTypedNoteMatch(nativeNoteRef,providerTypedRef){
 validateKeepItReference(nativeNoteRef);
 validateKeepItTypedReference(providerTypedRef);
 if(providerTypedRef.kind!=='note')throw Error('File reference is not a native note.');
 if(nativeNoteRef.provider!==providerTypedRef.provider
   ||nativeNoteRef.version!==providerTypedRef.version
   ||nativeNoteRef.scope!==providerTypedRef.scope
   ||nativeNoteRef.itemId!==providerTypedRef.itemId
   ||nativeNoteRef.revision!==providerTypedRef.revision) {
  throw Error('Native note and provider-resolved reference do not match.');
 }
 return true;
}

/** The standalone release has NO trusted provider composition. Never convert
 * a reference, a URL, or a claimed grant into a working connection.
 */
export function keepItPlatformAvailability(){
 return {status:'NOT_CONNECTED',contractMajor:1,cloudVerified:false,
  canCreateNativeNote:false,canOpenNativeNote:false,canAttach:false,
  canReadDocuments:false,canSync:false};
}
