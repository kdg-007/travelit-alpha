import {SCHEMA_VERSION,validateBackup} from './domain.js';
const payload=b=>JSON.stringify({format:b.format,schemaVersion:b.schemaVersion,records:b.records,outbox:b.outbox});
async function checksum(text){if(!globalThis.crypto?.subtle)throw Error('Secure Web Crypto unavailable; cannot verify backup integrity.');const bytes=new TextEncoder().encode(text);const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function createBackup(data,now=new Date().toISOString()){
  const backup={format:'travelit-local-backup',schemaVersion:SCHEMA_VERSION,exportedAt:now,records:data.records,outbox:data.outbox};validateBackup(backup);
  backup.integrity={algorithm:'SHA-256',encoding:'hex',scope:'format-schema-records-outbox',digest:await checksum(payload(backup))};return backup;
}
export async function verifyBackup(data){
  validateBackup(data);
  if(data.schemaVersion===1){if(data.integrity)throw Error('Legacy backups cannot use the new integrity envelope.');return {backup:{...data,schemaVersion:SCHEMA_VERSION},legacy:true};}
  if(!data.integrity||data.integrity.algorithm!=='SHA-256'||data.integrity.scope!=='format-schema-records-outbox'||!/^[a-f0-9]{64}$/.test(data.integrity.digest||''))throw Error('Backup is missing its SHA-256 integrity manifest.');
  if(await checksum(payload(data))!==data.integrity.digest)throw Error('Backup integrity check failed; restore was not performed.');
  return {backup:data,legacy:false};
}
