import test from 'node:test';
import assert from 'node:assert/strict';
import {validateKeepItReference,KEEPIT_CONNECTION} from '../js/keepit-associations.js';
import {KEEPIT_PLATFORM_ALIGNMENT,validateKeepItTypedReference,assertNativeAndTypedNoteMatch,keepItPlatformAvailability} from '../js/keepit-platform-compat.js';

const base=Object.freeze({
 provider:'keepit',version:1,
 scope:'sha256:'+'a'.repeat(64),
 itemId:'123e4567-e89b-42d3-a456-426614174000',revision:2
});
const typed=Object.freeze({...base,kind:'note'});

test('native v1 reference and generic typed Platform v1 reference stay distinct',()=>{
 assert.equal(validateKeepItReference(base),true);
 assert.equal(validateKeepItTypedReference(typed),true);
 assert.throws(()=>validateKeepItReference(typed),/exact KeepIt reference-v1 envelope/);
 assert.throws(()=>validateKeepItTypedReference(base),/exact provider-issued/);
 assert.equal(assertNativeAndTypedNoteMatch(base,typed),true);
});
test('the provider must resolve the precise note and library scope: no blind casting',()=>{
 for(const change of [
  {kind:'file'},{revision:3},{scope:'sha256:'+'b'.repeat(64)},
  {itemId:'123e4567-e89b-42d3-a456-426614174111'},
  {provider:'other'},{version:2}
 ])assert.throws(()=>assertNativeAndTypedNoteMatch(base,{...typed,...change}));
 assert.throws(()=>validateKeepItTypedReference({...typed,revision:0}),/positive revision/);
 assert.throws(()=>validateKeepItTypedReference({...typed,cloudVerified:true}),/exact provider-issued/);
});
test('legacy revision zero remains readable but is not implicitly promoted to Platform typed revision',()=>{
 const legacy={...base,revision:0};
 assert.equal(validateKeepItReference(legacy),true);
 assert.throws(()=>assertNativeAndTypedNoteMatch(legacy,{...typed,revision:0}),/positive revision/);
});
test('TravelIt offline mode stays truthful even if callers supply arbitrary references',()=>{
 const status=keepItPlatformAvailability();
 assert.deepEqual(status,{
  status:'NOT_CONNECTED',contractMajor:1,cloudVerified:false,
  canCreateNativeNote:false,canOpenNativeNote:false,canAttach:false,
  canReadDocuments:false,canSync:false
 });
 assert.equal(KEEPIT_PLATFORM_ALIGNMENT.enabled,false);
 assert.equal(KEEPIT_PLATFORM_ALIGNMENT.runtimeHostInstalled,false);
 assert.equal(KEEPIT_CONNECTION.canSync,false);
 assert.equal(KEEPIT_CONNECTION.canWriteNotes,false);
});
