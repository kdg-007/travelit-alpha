/** Local same-origin notice, not cloud synchronization and not mutual exclusion. */
export const WORKSPACE_TOPIC='travelit-workspace-changes-v1';
export function isValidWorkspaceNotice(v,ownId){
 return !!v&&v.kind==='travelit-local-change'&&v.schema===1&&typeof v.tabId==='string'&&v.tabId!==ownId&&typeof v.nonce==='string'&&Number.isFinite(v.timestamp)&&Math.abs(Date.now()-v.timestamp)<86400000;
}
export function createWorkspaceCoordinator({onChange,channelFactory=globalThis.BroadcastChannel,storage=undefined,tabId=globalThis.crypto.randomUUID(),eventTarget=globalThis.window}={}){
 if(typeof onChange!=='function')throw Error('Cross-tab listener required.');
 if(storage===undefined){try{storage=globalThis.localStorage;}catch{storage=null;}}
 let channel=null,closed=false;const seen=new Set();
 function receive(payload){if(closed||!isValidWorkspaceNotice(payload,tabId)||seen.has(payload.nonce))return;seen.add(payload.nonce);if(seen.size>150)seen.clear();onChange(payload);}
 try{if(channelFactory){channel=new channelFactory(WORKSPACE_TOPIC);channel.onmessage=e=>receive(e.data);}}catch{channel=null;}
 const handleStorage=e=>{if(e.key!==WORKSPACE_TOPIC||!e.newValue)return;try{receive(JSON.parse(e.newValue));}catch{}};
 try{eventTarget?.addEventListener?.('storage',handleStorage);}catch{}
 return {tabId,announce(reason='edit'){
   if(closed)return;const payload={kind:'travelit-local-change',schema:1,tabId,nonce:globalThis.crypto.randomUUID(),timestamp:Date.now(),reason};
   try{channel?.postMessage(payload);}catch{}
   try{storage?.setItem?.(WORKSPACE_TOPIC,JSON.stringify(payload));}catch{}
 },close(){closed=true;try{channel?.close?.();}catch{}try{eventTarget?.removeEventListener?.('storage',handleStorage);}catch{}}};
}
