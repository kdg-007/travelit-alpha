/* Preview-only read-only environment diagnostics; never accesses record contents or sends data. */
const liveHost='kdg-007.github.io';
const localHosts=new Set(['localhost','127.0.0.1','[::1]']);
const check=(id,label,status,detail)=>({id,label,status,detail});
export async function collectPreviewReadiness(){
 const host=location.hostname.toLowerCase(),local=localHosts.has(host),checks=[];
 if(host===liveHost)return {origin:location.origin,checks:[check('origin','Isolated origin','hold','Existing GitHub Pages origin is not isolated.')]};
 const secure=location.protocol==='https:'||local;
 checks.push(check('origin','Separate HTTPS host',secure?(local?'info':'pass'):'hold',!secure?'Public HTTP is unsafe.':local?'Local simulation only; iPhone requires separate HTTPS host.':'Known GitHub Pages production host not detected; separately confirm provider ownership.'));
 const standalone=Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches||navigator.standalone);
 checks.push(check('standalone','Home Screen mode',standalone?'pass':'info',standalone?'Standalone display detected.':'Browser-tab mode; install status not confirmed.'));
 try{
  const names=typeof indexedDB.databases==='function'?(await indexedDB.databases()).map(x=>x.name):null;
  checks.push(check('storage','Isolated local database',!names?'info':names.includes('travelit-foundation')?'hold':names.includes('travelit-rc1-preview')?'pass':'info',
   !names?'Database enumeration unavailable.':names.includes('travelit-foundation')?'Production database detected; stop testing.':names.includes('travelit-rc1-preview')?'Preview database exists, without production database.':'Create a synthetic trip, then rerun.'));
 }catch{checks.push(check('storage','Isolated local database','info','Could not inspect database names.'));}
 try{
  const {verifyOfflineShell}=await import('./offline-shell.js');
  const x=await verifyOfflineShell({scope:new URL('./',location.href).href});
  checks.push(check('offline','Offline shell',x.ready?'pass':'hold',x.ready?'All '+x.cached+'/'+x.total+' app-shell files cached; device permanence not guaranteed.':x.reason));
 }catch{checks.push(check('offline','Offline shell','hold','Unable to check installed app shell.'));}
 try{
  const {keepItConnectionStatus}=await import('./keepit-associations.js');
  const x=keepItConnectionStatus(),disabled=x.status==='NOT_CONNECTED'&&!x.canSync&&!x.canWriteNotes;
  checks.push(check('keepit','KeepIt safety boundary',disabled?'pass':'hold',disabled?'Not connected: native notes and OneDrive sync unavailable.':'Unexpected provider capability detected.'));
 }catch{checks.push(check('keepit','KeepIt safety boundary','hold','Unable to verify disconnected mode.'));}
 return {origin:location.origin,checks};
}
let state=null;
function summary(){
 return {format:'travelit-rc1-preview-acceptance-v1',origin:state?.origin||location.origin,
   automatic:state?.checks||[],manual:[...document.querySelectorAll('[data-accept]')].map(x=>({id:x.dataset.accept,checked:x.checked})),
   disclaimer:'Manual checks are user observations, not independent iPhone or cloud certification.'};
}
function updateReport(){document.querySelector('#report-json').value=JSON.stringify(summary(),null,2);}
function render(x){
 state=x;const list=document.querySelector('#automatic-checks');list.replaceChildren();
 for(const c of x.checks){
  const li=document.createElement('li');li.dataset.check=c.id;li.dataset.status=c.status;
  const pill=document.createElement('span');pill.className='status '+c.status;pill.textContent=c.status.toUpperCase();
  const words=document.createElement('span'),label=document.createElement('strong');label.textContent=c.label;
  words.append(label,document.createTextNode(' — '+c.detail));li.append(pill,words);list.append(li);
 }updateReport();
}
async function refresh(){const btn=document.querySelector('#run-checks');btn.disabled=true;
 try{render(await collectPreviewReadiness());}catch{render({origin:location.origin,checks:[check('diagnostics','Preview diagnostics','hold','Readiness inspection failed.')]});}
 finally{btn.disabled=false;}
}
if(location.hostname.toLowerCase()===liveHost){
 document.body.replaceChildren(document.createTextNode('Blocked: preview checks cannot run on the existing GitHub Pages origin.'));
}else{
 document.querySelector('#run-checks').addEventListener('click',refresh);
 document.querySelectorAll('[data-accept]').forEach(x=>x.addEventListener('change',updateReport));
 document.querySelector('#copy-report').addEventListener('click',async()=>{
  const field=document.querySelector('#report-json');
  try{await navigator.clipboard.writeText(field.value);document.querySelector('#copy-status').textContent='Copied.';}
  catch{field.focus();field.select();document.querySelector('#copy-status').textContent='Select and copy the highlighted text.';}
 });
 void refresh();
}
