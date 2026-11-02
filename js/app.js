import {keepItConnectionStatus} from './keepit-associations.js';
import {auditWorkspace,storageReadbackProbe} from './local-health.js';
import {verifyOfflineShell} from './offline-shell.js';
import {createWorkspaceCoordinator} from './workspace-coordination.js';
import {VEHICLE_TYPES,EXPENSE_CATEGORIES,normalizeVehicle,normalizeExpense,tripCostSummary,travelFeasibility} from './trip-costs.js';
import {openDatabase,allData,guardedSaveRecord,guardedSaveRecords,guardedDeleteRecord,getWorkspaceMetadata,restore,recoveryInfo,undoRestore,listMapPacks,putMapPack,deleteMapPack,listAtlasRegions,putAtlasRegion,getAtlasTiles,deleteAtlasRegion,getSetting,setActiveMapPack} from './db.js';
import {PACKING_TEMPLATES,prepareTemplateImport} from './packing-templates.js';
import {persistPackingToggle} from './packing-interaction.js';
import {normalizeAnnotation,exactCoordinatesFromLink,assessOfflineTrip,mapBounds} from './map-tools.js';
import {mapMarkup,mapClickToGeo} from './map-view.js';
import {MAP_LIMITS,inspectFeatureCollection,sha256MapPack,verifyMapPack,portableMapExport,portableMapImport} from './offline-map-pack.js';
import {FREE_MAP_CATALOG,fetchCatalogRegion,catalogFailureHelp} from './map-catalog.js';
import {inspectOsmStreetPack,OSM_IMPORT_LIMITS} from './osm-street-import.js';
import {ATLAS_LIMITS,prepareRegionAtlas,visibleTileDescriptors,estimateVisibleFeatureCount,verifyAtlasTile,verifyRegionManifest} from './region-atlas.js';
import {SELF_SERVICE_LIMITS,buildAtlasFromRoadGeoJSON,inspectInstalledAtlas} from './atlas-pack-tools.js';
import {moveViewport,streetReferenceBounds} from './map-navigation.js';
import {createBackup,verifyBackup} from './backup.js';
import {restoreImpact} from './restore-impact.js';
import {makeTripBrief} from './trip-brief.js';
import {reviewTripPreparation} from './trip-preparation.js';
import {buildOnTheRoadQueue} from './on-the-road.js';
import {pickTodayTrip,tripClock,nextTodayStop} from './today-schedule.js';
import {DISCOVERY_STAGES,findDuplicatePlace,dateSpan,nextTripDay,tripDayPosition,nearbyTripDays,itineraryOrder,reorderFlexibleStops,tripCalendar,discoveryCounts} from './travel-planning.js';
import {SCHEMA_VERSION,PLACE_CATEGORIES,STOP_KINDS,PACK_CATEGORIES,cleanText,normalizePlace,normalizeTrip,normalizeStop,normalizePacking,wazeUrl,tripDateAt,conflicts,validateBackup} from './domain.js';
const $=s=>document.querySelector(s);
let modalDirty=false,modalReturnFocus=null,modalBaseRevisions={},modalBasePresence={},modalBaseEpoch=null,modalBaseMapRevision=0,workspaceChannel=null,externalRefreshTimer=null,localOperationDepth=0,versionObsolete=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const navigation=[['explore','Explore','⌖'],['trips','Trips','▤'],['today','Today','◷'],['photos','Photos','▧'],['more','More','⋯']];
const state={db:null,recovery:null,view:'explore',places:[],trips:[],stops:[],packing:[],vehicles:[],expenses:[],outbox:[],keepitAssociations:[],annotations:[],mapPacks:[],activePackId:null,mapFaults:[],atlasView:null,atlasLoading:null,atlasRequest:0,atlasAudit:null,mapDraft:null,mapFixedBounds:null,storageState:'Checking storage…',storageHealth:null,localAudit:null,shellCached:false,shellReport:null,selectedTrip:null,tripTab:'itinerary',search:'',category:'All',stageFilter:'All',calendarMonth:'',chosenDay:'',toastTimer:null};
state.recordRevisions={};state.recordPresence={};state.workspaceEpoch=null;state.workspaceRevision=0;state.mapRevision=0;
const isOnline=()=>navigator.onLine;
const byTrip=type=>type.filter(v=>v.tripId===state.selectedTrip);
const placeById=id=>state.places.find(p=>p.id===id);
const tripById=id=>state.trips.find(t=>t.id===id);
const selected=()=>tripById(state.selectedTrip)||null;
const pad=n=>String(n).padStart(2,'0');
const dateShort=d=>{if(!d)return '';const [y,m,day]=d.split('-');return `${m}/${day}/${y}`;};
function colorStatus(){const e=$('#connection-pill');if(!e)return;e.textContent=isOnline()?'On-device only':'Offline · on-device';e.classList.toggle('offline',!isOnline());}
function toast(msg,error=false){const t=$('#toast');t.textContent=msg;t.className='toast'+(error?' error':'');clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>t.classList.add('hidden'),4400);}
function setNav(view){state.view=view;const url=new URL(location.href);url.searchParams.set('view',view);['title','text','url'].forEach(k=>url.searchParams.delete(k));history.replaceState(null,'',url);render();}
async function refresh(){const data=await allData(state.db);const info=await getWorkspaceMetadata(state.db);state.recordRevisions=Object.fromEntries(data.records.map(r=>[r.key,r.localRevision??0]));state.recordPresence=Object.fromEntries(data.records.map(r=>[r.key,true]));state.workspaceEpoch=info.epoch;state.workspaceRevision=info.revision;state.mapRevision=info.mapRevision;const of=type=>data.records.filter(r=>r.type===type).map(r=>r.data);state.places=of('place').sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));state.trips=of('trip').sort((a,b)=>a.startDate.localeCompare(b.startDate));state.stops=of('stop');state.packing=of('packing');state.vehicles=of('vehicle');state.expenses=of('expense');state.annotations=of('annotation');state.keepitAssociations=of('keepitAssociation');state.outbox=data.outbox;state.recovery=await recoveryInfo(state.db);const packs=await listMapPacks(state.db);state.mapPacks=[];state.mapFaults=[];for(const pack of packs){if(await verifyMapPack(pack))state.mapPacks.push(pack);else state.mapFaults.push(pack.name||'Unnamed corrupt map');}for(const region of await listAtlasRegions(state.db)){if(await verifyRegionManifest(region))state.mapPacks.push(region);else state.mapFaults.push(region.name||'Corrupt regional atlas');}const active=await getSetting(state.db,'active-map-pack-id');state.activePackId=active==='__none__'?null:(state.mapPacks.some(p=>p.id===active)?active:(state.mapPacks[0]?.id||null));if(!selected()&&state.trips.length)state.selectedTrip=state.trips[0].id;}
async function finishMapChange(){await refresh();workspaceChannel?.announce('map-edit');}
async function commit(type,value){const guard=guardedContext(type,value.id);await writeLocally(()=>guardedSaveRecord(state.db,type,value,guard));}
/** A failed save must never leave a packing checkbox appearing saved. */
async function handlePackingChange(input){
 const item=state.packing.find(x=>x.id===input.dataset.packId);
 if(!item){input.checked=false;toast('Packing item no longer exists. Reload to review.',true);scheduleExternalRefresh();return;}
 const previous=Boolean(item.packed);
 input.disabled=true;
 const result=await persistPackingToggle(item,input.checked,value=>commit('packing',value));
 if(!result.ok){
  input.checked=previous;
  try{await refresh();render();}catch{}
  toast('Packing change NOT saved: '+(result.error?.message||'Storage failure. Review and retry.'),true);
 }
 if(input.isConnected)input.disabled=false;
}
async function erase(type,id){const guard=guardedContext(type,id);await writeLocally(()=>guardedDeleteRecord(state.db,type,id,guard));toast('Removed locally; original KeepIt assets are untouched.');}
function section(title,subtitle='',actions=''){return `<div class="section-head"><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div>${actions}</div>`;}
function action(label,action,classes='button button-small',extra=''){return `<button type="button" class="${classes}" data-action="${action}" ${extra}>${label}</button>`;}
function link(label,url){return `<a class="button button-small" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;}
function selOptions(items,chosen){return items.map(x=>`<option value="${esc(x)}" ${x===chosen?'selected':''}>${esc(x)}</option>`).join('');}
function field(name,label,value='',type='text',extra=''){return `<div class="field"><label for="f-${name}">${esc(label)}</label><input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}></div>`;}
function textArea(name,label,value='',help=''){return `<div class="field full"><label for="f-${name}">${esc(label)}</label><textarea id="f-${name}" name="${name}">${esc(value)}</textarea>${help?`<div class="field-help">${esc(help)}</div>`:''}</div>`;}
function selectField(name,label,options,chosen){return `<div class="field"><label for="f-${name}">${esc(label)}</label><select id="f-${name}" name="${name}">${selOptions(options,chosen)}</select></div>`;}
function openModal(title,markup,onSubmit=null,submitText='Save locally'){
  modalDirty=false;modalReturnFocus=document.activeElement;modalBaseRevisions={...state.recordRevisions,__workspaceRevision:state.workspaceRevision};modalBasePresence={...state.recordPresence};modalBaseEpoch=state.workspaceEpoch;modalBaseMapRevision=state.mapRevision;
  $('#modal-title').textContent=title;$('#modal-body').innerHTML=`<form id="modal-form">${markup}${onSubmit?`<div class="modal-actions"><button type="button" class="button" id="cancel-modal">Cancel</button><button type="submit" class="button button-primary">${esc(submitText)}</button></div><div id="form-error" class="errorbox hidden" role="alert"></div>`:''}</form>`;
  $('#modal-backdrop').classList.remove('hidden');$('#modal-close').focus();$('#cancel-modal')?.addEventListener('click',()=>closeModal());
  const form=$('#modal-form');if(onSubmit){form.addEventListener('input',()=>{modalDirty=true;});form.addEventListener('change',()=>{modalDirty=true;});}if(onSubmit)form.addEventListener('submit',async ev=>{ev.preventDefault();const btn=form.querySelector('button[type=submit]');btn.disabled=true;try{await onSubmit(Object.fromEntries(new FormData(form).entries()),form);closeModal(true);}catch(err){const el=$('#form-error');el.textContent=err.message||String(err);el.classList.remove('hidden');btn.disabled=false;}});
}
function showExternalChangeNotice(){
 const form=$('#modal-form');if(!form||$('#external-tab-warning'))return;
 const note=document.createElement('div');note.id='external-tab-warning';note.className='alert red';note.setAttribute('role','alert');
 note.textContent='Another TravelIt tab changed local data. Your draft remains here. Saving will be blocked if this item was changed or the workspace was restored. Copy important text before closing.';
 form.prepend(note);
}
function warnVersionChange(){versionObsolete=true;try{workspaceChannel?.close();}catch{};const banner=document.createElement('div');banner.className='alert red';banner.setAttribute('role','alert');banner.textContent='TravelIt storage was upgraded in another tab. This tab cannot save. Copy unfinished text, close it, then reopen TravelIt.';$('#main').prepend(banner);showExternalChangeNotice();}
async function externalRefresh(){
 if(!state.db||versionObsolete||localOperationDepth>0){if(localOperationDepth>0)scheduleExternalRefresh();return;}
 try{await refresh();if(!$('#modal-backdrop').classList.contains('hidden'))showExternalChangeNotice();else render();}
 catch(e){toast('Another tab changed TravelIt. Refresh this page before editing.',true);}
}
function scheduleExternalRefresh(){
 if(externalRefreshTimer)clearTimeout(externalRefreshTimer);
 externalRefreshTimer=setTimeout(()=>{externalRefreshTimer=null;void externalRefresh();},160);
}
function guardedContext(type,id){
 const inDialog=!$('#modal-backdrop').classList.contains('hidden');const key=`${type}:${id}`;
 return {expectedEpoch:inDialog?modalBaseEpoch:state.workspaceEpoch,expectedRevisionByKey:{[key]:(inDialog?modalBaseRevisions[key]:state.recordRevisions[key])??0},expectedPresenceByKey:{[key]:Boolean(inDialog?modalBasePresence[key]:state.recordPresence[key])}};
}
async function writeLocally(work){
 if(versionObsolete)throw Error('TravelIt was upgraded in another tab. Reopen this page before saving.');
 localOperationDepth++;try{await work();await refresh();workspaceChannel?.announce('edit');render();toast('Saved on this device.');}
 finally{localOperationDepth--;}
}
function closeModal(force=false){if(modalDirty&&force!==true&&!confirm('Discard your unsaved changes?'))return false;$('#modal-backdrop').classList.add('hidden');$('#modal-body').replaceChildren();modalDirty=false;if(modalReturnFocus?.isConnected)modalReturnFocus.focus();else $('#quick-save').focus();return true;}
async function imageCoverFromFile(file){
 if(!file)return '';
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error('Choose a JPEG, PNG or WebP image under 10 MB.');
 const url=URL.createObjectURL(file);
 try{
  const img=new Image();img.src=url;
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('The image could not be opened.'));});
  if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>40_000_000)throw Error('Image dimensions are too large.');
  const scale=Math.min(1,900/img.naturalWidth,580/img.naturalHeight),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
  for(const quality of [0.74,0.58,0.42]){
   const result=canvas.toDataURL('image/jpeg',quality);
   if(result.length<=190000)return result;
  }
  throw Error('This image is too detailed for a local cover. Choose a smaller screenshot.');
 }finally{URL.revokeObjectURL(url);}
}
function placeCover(p){return p.coverImage?`<img src="${esc(p.coverImage)}" alt="Cover saved for ${esc(p.name)}" loading="lazy">`:`<span class="cover-category">${esc(p.category)}</span><span class="cover-mark" aria-hidden="true">✦</span>`;}
function placeEditor(p=null,share=null){
 const v=p||{},sh=share||{};
 openModal(p?'Edit place':'Save a place',`<div class="form-grid">${field('name','Place name',v.name==='Unidentified place'?'':v.name||sh.title||'')}${selectField('category','Type',PLACE_CATEGORIES,v.category||'Destination')}<div class="field full">${field('sourceUrl','Reel or website link',v.sourceUrl||sh.url||'', 'url')}</div><div class="field full"><label for="place-cover-file">Cover image (optional)</label><input id="place-cover-file" type="file" accept="image/jpeg,image/png,image/webp"><p class="field-help">Use a screenshot of the reel if its thumbnail is unavailable. The compressed image is saved with the place and included in local backups.</p>${v.coverImage?`<img class="cover-editor-preview" src="${esc(v.coverImage)}" alt="Saved cover">${action('Remove cover','remove-place-cover','button button-small')}`:''}</div>${selectField('stage','Saved as',DISCOVERY_STAGES,v.stage||'Idea')}${textArea('notes','What caught your eye?',v.notes||sh.notes||'')}<details class="field full subtle-details"><summary>Add location pin</summary><div class="form-grid">${field('lat','Latitude',v.lat??'','text','inputmode="decimal"')}${field('lng','Longitude',v.lng??'','text','inputmode="decimal"')}</div><button type="button" id="extract-link-coordinates" class="button button-small">Use coordinates from map link</button></details></div>`,async f=>{
  const file=$('#place-cover-file').files?.[0];const coverImage=file?await imageCoverFromFile(file):(removedCover?'':(v.coverImage||''));
  const place=normalizePlace({...v,...f,coverImage,id:v.id,createdAt:v.createdAt});
  const existing=findDuplicatePlace(state.places,place.sourceUrl,p?.id);
  if(existing)throw Error(`This link is already saved as “${existing.name}”.`);
  await commit('place',place);
 });
 let removedCover=false;
 if(sh.url||sh.title||sh.notes)modalDirty=true;
 $('#extract-link-coordinates').addEventListener('click',()=>{const coords=exactCoordinatesFromLink($('#f-sourceUrl').value);if(!coords)return toast('This link has no embedded coordinates. You can pin it later.',true);$('#f-lat').value=String(coords.lat);$('#f-lng').value=String(coords.lng);modalDirty=true;toast('Pin copied from map link.');});
 $('#modal-body [data-action="remove-place-cover"]')?.addEventListener('click',e=>{e.preventDefault();removedCover=true;modalDirty=true;$('#modal-body .cover-editor-preview')?.remove();e.currentTarget.remove();});
}
function tripEditor(t=null){
 const v=t||{},today=tripDateAt(new Date());
 openModal(t?'Edit trip':'Plan a new trip',`<div class="form-grid">${field('title','Trip name',v.title||'', 'text','required maxlength="150"')}${field('startDate','Departure date',v.startDate||today,'date','required')}${field('endDate','Return date',v.endDate||today,'date','required')}<p class="field-help full">Choose your departure, then select the return date. You can add a vehicle later in Budget.</p></div>`,async f=>{
  const trip=normalizeTrip({...v,...f,id:v.id,createdAt:v.createdAt,timezone:v.timezone||'Asia/Manila',vehicleId:v.vehicleId||null,fuelReservePct:v.fuelReservePct??10});
  if(t){const outside=state.stops.filter(s=>s.tripId===trip.id&&(s.date<trip.startDate||s.date>trip.endDate));if(outside.length)throw Error(`Move or remove ${outside.length} scheduled activities outside the new date range first.`);}
  await commit('trip',trip);state.selectedTrip=trip.id;render();
 });
 $('#f-startDate').addEventListener('change',()=>{
  const depart=$('#f-startDate').value,returnDate=$('#f-endDate');if(!depart)return;
  returnDate.min=depart;if(returnDate.value<depart)returnDate.value=depart;
  returnDate.focus();try{returnDate.showPicker?.();}catch{/* iOS may not support programmatic date picker. Focus still advances. */}
 });
}
function tripVehicleEditor(){
 const trip=selected();if(!trip)return;
 openModal('Vehicle for fuel estimates',`<p class="subtext">Choose a vehicle only when you need a fuel estimate.</p><div class="field"><label for="f-vehicleId">Vehicle (optional)</label><select name="vehicleId" id="f-vehicleId"><option value="">None</option>${state.vehicles.map(v=>`<option value="${esc(v.id)}" ${trip.vehicleId===v.id?'selected':''}>${esc(v.name)}</option>`).join('')}</select></div>${field('fuelReservePct','Fuel contingency (%)',trip.fuelReservePct??10,'number','min="0" max="50"')}`,async f=>{
  await commit('trip',normalizeTrip({...trip,vehicleId:f.vehicleId||null,fuelReservePct:f.fuelReservePct,createdAt:trip.createdAt}));
 });
}
function stopEditor(s=null){
 const trip=selected();if(!trip)return toast('Create a trip first.',true);
 const v=s||{},date=v.date||state.chosenDay||trip.startDate;
 const options=state.places.map(p=>`<option value="${esc(p.id)}" ${p.id===v.placeId?'selected':''}>${esc(p.name)}</option>`).join('');
 openModal(s?'Edit activity':'Add activity',`<div class="form-grid">${field('title','Activity',v.title||'','text','required maxlength="150"')}${field('time','Start time',v.time||'','time')}${field('date','Day',date,'date',`min="${trip.startDate}" max="${trip.endDate}" required`)}${field('durationMinutes','Duration (min)',v.durationMinutes??0,'number','min="0" max="10080"')}${selectField('kind','Type',STOP_KINDS,v.kind||'Activity')}<div class="field"><label for="f-placeId">Saved place</label><select id="f-placeId" name="placeId"><option value="">Optional</option>${options}</select></div><details class="field full subtle-details"><summary>Booking, travel time & notes</summary><div class="form-grid"><label class="field full"><span><input type="checkbox" name="fixed" value="yes" ${v.fixed?'checked':''}> Fixed booking</span></label>${field('legOrigin','Coming from',v.legOrigin||'')}${field('legDistanceKm','Drive (km)',v.legDistanceKm??'','number','min="0" max="100000" step="0.1"')}${field('legTravelMinutes','Drive (minutes)',v.legTravelMinutes??'','number','min="0" max="100800"')}${field('legTollPhp','Tolls (₱)',v.legTollPhp??'','number','min="0" max="1000000" step="0.01"')}${textArea('notes','Notes',v.notes||'')}</div></details></div>`,async f=>{
   const stop=normalizeStop({...v,...f,id:v.id,createdAt:v.createdAt,fixed:f.fixed==='yes'},trip);
   await commit('stop',stop);
 });
}
function vehicleEditor(existing=null){const v=existing||{};openModal(existing?'Edit vehicle':'Add vehicle',`<div class="form-grid">${field('nickname','Name (optional)',v.nickname||(v.make||v.model?'':v.name)||'','text','maxlength="120" placeholder="e.g. Family car"')}${field('make','Make',v.make||'','text','required maxlength="80" placeholder="e.g. MG"')}${field('model','Model',v.model||'','text','required maxlength="100" placeholder="e.g. MG6"')}${selectField('type','Fuel type',VEHICLE_TYPES,v.type||'Gasoline')}${field('kmPerLiter','Average fuel economy (km/L)',v.kmPerLiter??'','number','min="0.1" max="100" step="0.1"')}${field('fuelPricePhp','Fuel price (₱/L)',v.fuelPricePhp??'','number','min="0" max="500" step="0.01"')}${textArea('notes','Notes (optional)',v.notes||'')}</div>`,async f=>{await commit('vehicle',normalizeVehicle({...v,...f,id:v.id,createdAt:v.createdAt}));});}
function expenseEditor(existing=null){const trip=selected();if(!trip)return toast('Select a trip first.',true);const v=existing||{};openModal(existing?'Edit cost':'Add trip cost',`<div class="form-grid">${field('label','Expense description',v.label||'','text','required maxlength="150"')}${selectField('category','Category',EXPENSE_CATEGORIES,v.category||'Accommodation')}${field('date','Trip date (optional)',v.date||'','date',`min="${trip.startDate}" max="${trip.endDate}"`)}${field('plannedPhp','Planned amount (₱)',v.plannedFormula??v.plannedPhp??'','text','inputmode="decimal" placeholder="=3000*5" maxlength="120"')}${field('actualPhp','Actual amount (₱)',v.actualFormula??v.actualPhp??'','text','inputmode="decimal" placeholder="0 or =1500*2" maxlength="120"')}${textArea('notes','Notes',v.notes||'')}</div>`,async f=>{await commit('expense',normalizeExpense({...v,...f,id:v.id,createdAt:v.createdAt},trip));});}
const peso=n=>'₱'+Number(n).toLocaleString('en-PH',{maximumFractionDigits:0});
function renderCosts(t){
 const stops=byTrip(state.stops),expenses=byTrip(state.expenses),vehicle=state.vehicles.find(v=>v.id===t.vehicleId)||null,estimate=tripCostSummary({trip:t,stops,expenses,vehicle});
 const partial=[];
 if(!vehicle)partial.push('No vehicle selected');
 else if(!estimate.fuelConfigured)partial.push('Vehicle fuel economy or fuel price missing');
 if(estimate.unknownDistanceCount)partial.push(`${estimate.unknownDistanceCount} stop(s) without a driving distance`);
 if(estimate.unknownTollCount)partial.push(`${estimate.unknownTollCount} stop(s) without a toll estimate`);
 if(estimate.plannedUnknown)partial.push(`${estimate.plannedUnknown} cost item(s) missing a planned amount`);
 return `<div class="stack">${section('Trip estimates','User-entered distances, never live routing or real-time fuel prices',action('+ Add expense','add-expense','button button-primary button-small'))}<div class="grid3"><div class="card"><div class="subtext">Entered driving legs</div><div class="metric">${estimate.distanceKm.toFixed(1)} km</div><p class="tiny muted">${estimate.unknownDistanceCount} distance(s) unknown</p></div><div class="card"><div class="subtext">Fuel + ${estimate.reserve}% reserve</div><div class="metric">${estimate.fuelPhp===null?'Unknown':peso(estimate.fuelPhp)}</div><p class="tiny muted">${estimate.liters===null?'Configure vehicle':estimate.liters.toFixed(1)+' liters · partial if legs missing'}</p></div><div class="card"><div class="subtext">Known plan subtotal</div><div class="metric">${peso(estimate.plannedSubtotal)}</div><p class="tiny muted">Includes entered expenses and known tolls; not a complete trip quote</p></div></div><div class="alert ${partial.length?'red':'blue'}"><strong>${partial.length?'Partial estimate — more inputs needed':'All entered planning fields have values'}</strong><p class="subtext">${partial.length?esc(partial.join(' · ')):'These are still manually entered assumptions; traffic, bookings and fuel prices are not verified.'}</p></div><div class="card"><div class="row-between wrap"><h3>Vehicle assumptions</h3>${action('Choose vehicle','assign-trip-vehicle')}</div><p>${vehicle?`${esc(vehicle.name)} · ${esc(vehicle.type)} · ${vehicle.kmPerLiter??'?'} km/L · ${vehicle.fuelPricePhp===null?'Fuel price missing':peso(vehicle.fuelPricePhp)+'/L'}`:'No vehicle selected. Add one in My Library, then choose it here.'}</p>${vehicle?.type==='PHEV'?'<div class="alert red">PHEV calculation is fuel-only. Electricity use, grid charging and battery depletion are NOT modeled.</div>':''}</div><div class="card"><div class="row-between wrap"><h3>Planned vs actual expenses</h3>${action('+ Add cost','add-expense')}</div>${expenses.length?expenses.map(e=>`<div class="schedule-item"><div class="schedule-main"><strong>${esc(e.label)}</strong><div class="schedule-desc">${esc(e.category)}${e.date?' · '+esc(e.date):''} · Plan: ${e.plannedPhp===null?'Unknown':peso(e.plannedPhp)} · Actual: ${e.actualPhp===null?'Not recorded':peso(e.actualPhp)}</div></div><div class="action-line">${action('Edit','edit-expense:'+e.id)}${action('Remove','delete-expense:'+e.id,'button button-small button-danger')}</div></div>`).join(''):'<p class="muted">No hotel, meal or activity costs entered yet.</p>'}<div class="divider"></div><div class="row-between"><strong>Entered planned expenses</strong><strong>${peso(estimate.expPlanned)}</strong></div><div class="row-between"><strong>Recorded actual expenses</strong><strong>${peso(estimate.expActual)}</strong></div><p class="tiny muted">Actual values exclude separately estimated fuel and tolls. Unknown actuals are not treated as paid.</p></div></div>`;
}
function renderVehicles(){return `<div class="card"><div class="row-between wrap"><h3>Vehicle profiles</h3>${action('+ Add vehicle','add-vehicle')}</div><p class="subtext">Use your own real-world km/L and fuel price. No external fuel price service or subscription.</p>${state.vehicles.length?state.vehicles.map(v=>`<div class="schedule-item"><div class="schedule-main"><strong>${esc(v.name)}</strong><div class="schedule-desc">${esc(v.type)} · ${v.kmPerLiter??'Unknown'} km/L · ${v.fuelPricePhp===null?'Price not set':peso(v.fuelPricePhp)+'/L'}</div></div><div class="action-line">${action('Edit','edit-vehicle:'+v.id)}${action('Remove','delete-vehicle:'+v.id,'button button-small button-danger')}</div></div>`).join(''):'<p class="muted">No vehicles configured yet.</p>'}</div>`;}
/** A visual packing brainstorm that generates existing local checklist records.
 * Input stays in the modal until the whole batch passes validation.
 */
function packingMindmapEditor(){
 const trip=selected();if(!trip)return toast('Choose a trip first.',true);
 const nodes=[
  ['Essentials','Documents & essentials'],['Clothing','Clothing & trail gear'],
  ['Personal care','First aid & toiletries'],['Electronics','Electronics & navigation'],
  ['Family','Family & child gear'],['Other','Shelter & sleep'],
  ['Other','Cooking & food'],['Other','Other gear']
 ];
 const markup='<div class="packing-map" aria-label="Packing brainstorm"><div class="packing-map-center"><strong>'+esc(trip.title)+'</strong><span>What should we bring?</span></div><div class="packing-map-nodes">'
   +nodes.map(([category,title],index)=>'<label class="packing-map-node"><strong>'+esc(title)+'</strong><small>One item per line</small><textarea name="packmap'+index+'" rows="4" maxlength="3000" placeholder="Add ideas…"></textarea></label>').join('')
   +'</div></div>';
 openModal('Plan your packing',markup,async(_f,form)=>{
  const existing=new Set(byTrip(state.packing).map(x=>x.label.trim().toLocaleLowerCase('en')));
  const rows=[];
  nodes.forEach(([category],index)=>{
   const value=form.elements.namedItem('packmap'+index)?.value||'';
   for(const raw of value.split(/\r?\n/)){
    const label=raw.trim().replace(/^[•*\-\s]+/,'').trim();
    if(!label)continue;
    const key=label.toLocaleLowerCase('en');
    if(existing.has(key))continue;
    existing.add(key);rows.push({label,category,quantity:1});
   }
  });
  if(!rows.length)throw Error('Add at least one new item.');
  if(rows.length>60)throw Error('Generate up to 60 items at a time.');
  const records=rows.map(row=>normalizePacking(row,trip));
  await writeLocally(()=>guardedSaveRecords(state.db,'packing',records,{
   expectedEpoch:modalBaseEpoch,
   expectedRevisionByKey:Object.fromEntries(records.map(x=>['packing:'+x.id,0])),
   expectedPresenceByKey:Object.fromEntries(records.map(x=>['packing:'+x.id,false]))
  }));
  state.tripTab='packing';render();
 },'Generate checklist');
}
function packingTemplateEditor(){
 const trip=selected();if(!trip){toast('Create a trip first.',true);return;}
 const names=Object.keys(PACKING_TEMPLATES);
 openModal('Add a packing template',`<p class="subtext" style="margin-bottom:16px">Choose a starting checklist. Existing packed items and personal edits will be preserved; duplicate item names will be skipped.</p><div class="field"><label for="f-template">Template</label><select id="f-template" name="template">${selOptions(names,names[0])}</select></div><div id="template-preview" class="template-preview" aria-live="polite"></div>`,async f=>{
  const current=byTrip(state.packing),template=prepareTemplateImport(f.template,trip,current,new Date().toISOString(),()=>crypto.randomUUID());
  if(!template.items.length){toast('All template items are already on this checklist.');return;}
  await writeLocally(()=>guardedSaveRecords(state.db,'packing',template.items,{expectedEpoch:modalBaseEpoch,expectedRevisionByKey:Object.fromEntries(template.items.map(item=>[`packing:${item.id}`,modalBaseRevisions[`packing:${item.id}`]??0])),expectedPresenceByKey:Object.fromEntries(template.items.map(item=>[`packing:${item.id}`,Boolean(modalBasePresence[`packing:${item.id}`])]))}));toast(`Added ${template.items.length} packing item(s); ${template.skipped} already listed. Saved locally.`);
 },'Add missing items');
 const updatePreview=()=>{const name=$('#f-template').value,preview=prepareTemplateImport(name,trip,byTrip(state.packing),'2026-10-30T00:00:00Z',()=>`preview-${Math.random()}`);$('#template-preview').innerHTML=`<strong>${preview.items.length} to add · ${preview.skipped} already listed</strong><ul>${PACKING_TEMPLATES[name].map(([category,label])=>`<li>${esc(label)} <span class="muted">· ${esc(category)}</span></li>`).join('')}</ul>`;};
 $('#f-template').addEventListener('change',updatePreview);updatePreview();
}
function packingEditor(p=null){const trip=selected();if(!trip){toast('Create a trip first.',true);return;}const v=p||{};openModal(p?'Edit packing item':'Add packing item',`<div class="form-grid">${field('label','Item',v.label||'','text','required')}${selectField('category','Category',PACK_CATEGORIES,v.category||'Essentials')}${field('quantity','Quantity',v.quantity||1,'number','min="1" max="999"')}${field('owner','Who packs it? (optional)',v.owner||'')}</div>`,async f=>{const item=normalizePacking({...v,...f,id:v.id,createdAt:v.createdAt},trip);await commit('packing',item);});}
function renderNav(){const nav=items=>items.map(([v,l,icon])=>`<button class="navitem ${state.view===v?'active':''}" data-view="${v}" ${state.view===v?'aria-current="page"':''}><span class="navicon">${icon}</span>${esc(l)}</button>`).join('');$('#side-nav').innerHTML=nav(navigation);$('#mobile-nav').innerHTML=nav(navigation);}
function renderExplore(){
 const filters=['All',...PLACE_CATEGORIES],statuses=['All',...DISCOVERY_STAGES];
 const counts=discoveryCounts(state.places);
 const match=state.places.filter(p=>(state.category==='All'||p.category===state.category)&&(state.stageFilter==='All'||(p.stage||'Idea')===state.stageFilter)&&[p.name,p.notes,p.sourceUrl].join(' ').toLowerCase().includes(state.search.toLowerCase()));
 return `<div class="library-toolbar"><div><h2>Saved places</h2><span class="count-label">${state.places.length} saved</span></div><div class="action-line">${action('Map','show-map','button button-small')}${action('+ Save','add-place','button button-primary button-small')}</div></div>
 <div class="search-row compact-search"><input class="search-input" id="explore-search" placeholder="Search places and links" aria-label="Search saved discoveries" value="${esc(state.search)}"><select id="category-filter" aria-label="Filter destination category">${selOptions(filters,state.category)}</select></div>
 ${state.places.length?`<div class="inbox-stages compact-stage" role="group" aria-label="Filter idea status">${statuses.map(st=>`<button type="button" class="stage-chip ${state.stageFilter===st?'active':''}" data-stage-filter="${esc(st)}" aria-pressed="${state.stageFilter===st}">${esc(st)} <span>${st==='All'?state.places.length:counts[st]}</span></button>`).join('')}</div>`:''}
 ${match.length?`<div class="story-grid">${match.map(p=>`<article class="story-card"><div class="story-cover">${placeCover(p)}</div><div class="story-meta"><span>${esc(p.category)}</span><span>${esc(p.stage||'Idea')}</span></div><h3>${esc(p.name)}</h3>${p.notes?`<p>${esc(p.notes)}</p>`:''}<div class="story-actions">${action('Details','place:'+p.id,'button button-small')}${action('Add to trip','plan-place:'+p.id,'button button-small')}${p.sourceUrl?link('Open link',p.sourceUrl):''}</div></article>`).join('')}</div>`:`<div class="quiet-empty"><strong>${state.places.length?'No matching places':'No places saved yet'}</strong>${!state.places.length?action('Save a place','add-place','button button-primary button-small'):''}</div>`}`;
}
function activePack(){return state.mapPacks.find(p=>p.id===state.activePackId)||null;}
function atlasViewport(pack){return state.mapFixedBounds||streetReferenceBounds(pack.bounds);}
function atlasKey(pack){return JSON.stringify([pack.id,atlasViewport(pack)]);}
function loadAtlasViewport(pack){
 const key=atlasKey(pack);if(state.atlasView?.key===key||state.atlasLoading===key)return;
 const request=++state.atlasRequest;state.atlasLoading=key;
 Promise.resolve().then(async()=>{
  const viewport=atlasViewport(pack),selection=visibleTileDescriptors(pack,viewport);
  const estimated=estimateVisibleFeatureCount(selection.tiles);
  const tooDense=estimated!==null&&estimated>ATLAS_LIMITS.visibleFeatures;
  let features=[],faults=[];
  if(!selection.tooMany&&!tooDense){
   const rows=await getAtlasTiles(state.db,pack.id,selection.tiles);
   for(let i=0;i<rows.length;i++){
    const row=rows[i],description=selection.tiles[i];
    if(!(await verifyAtlasTile(row,description))){faults.push(description.tileId);continue;}
    features.push(...row.features);
    if(features.length>ATLAS_LIMITS.visibleFeatures){faults.push('Viewport is too detailed; zoom further in');features=[];break;}
   }
  }
  if(request!==state.atlasRequest)return;
  state.atlasView={key,features,tooMany:selection.tooMany,tooDense,estimated,count:selection.count,faults};
  state.atlasLoading=null;if(state.view==='map')render();
 }).catch(error=>{if(request!==state.atlasRequest)return;state.atlasLoading=null;state.atlasView={key,features:[],tooMany:false,tooDense:false,estimated:null,count:0,faults:[error.message||'Unable to open local atlas']};if(state.view==='map')render();});
}
function renderMap(){
 const active=activePack(),isAtlas=!!active?.regionAtlas;
 if(isAtlas)loadAtlasViewport(active);
 const view=isAtlas&&state.atlasView?.key===atlasKey(active)?state.atlasView:null;
 const pack=isAtlas?{...active,features:view?.features||[]}:active;
 const status=isAtlas?(view?.tooMany?`<div class="alert red" role="status">${view.count} map cells intersect this view; zoom in before displaying streets. Pins remain available.</div>`:view?.tooDense?`<div class="alert red" role="status">This area references ${view.estimated} road segments across the selected cells. Zoom in or prepare an atlas with smaller cells. Pins remain available.</div>`:view?.faults.length?`<div class="alert red" role="alert">${view.faults.length} cell(s) missing, damaged or too detailed. Any damaged cells are withheld. Re-import the original atlas; overly dense views require zooming in.</div>`:`<div class="alert blue" role="status">${view?`Loaded ${view.count} geographic cell(s) from this device`:'Loading nearby geographic cells…'} · Offline road reference only · NOT routing or navigation.</div>`):'';
 const audit=state.atlasAudit&&active?.regionAtlas&&state.atlasAudit.packId===active.id?state.atlasAudit:null;
 const atlasStatus=active?.regionAtlas?`<div class="card" style="margin-top:12px"><h3>Offline atlas management</h3><p class="subtext">Complete map data are saved only in this browser until independently exported. Check every installed cell before a trip; verification does not guarantee iPhone storage persistence.</p><div class="action-line">${action('Verify all cells','verify-region-atlas','button button-primary button-small')}${action('Export regional atlas','export-region-atlas','button button-small')}</div>${audit?`<div role="status" class="alert ${audit.status==='valid'?'blue':'red'}" style="margin-top:9px">${audit.status==='checking'?'Checking map cells…':audit.status==='valid'?`${audit.verified}/${audit.total} map cells verified. Complete, as read today.`:audit.status==='damaged'?`${audit.verified}/${audit.total} verified; ${audit.failed} damaged/missing cells (first IDs): ${esc(audit.corruptedCells.join(', '))}`:esc(audit.message)}</div>`:''}</div>`:'';
 const technical=mapMarkup({places:state.places,annotations:state.annotations,draft:state.mapDraft,fixedBounds:state.mapFixedBounds,pack,packList:state.mapPacks,esc,action})+status+atlasStatus+(state.mapFaults.length?'<div class="alert red" role="alert">An imported map could not be displayed. Re-import a verified copy.</div>':'');
 if(active)return technical;
 const pins=state.places.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng));
 const focus=pins[0],lat=focus?.lat??12.8,lng=focus?.lng??122.0;
 const bbox=[lng-.38,lat-.23,lng+.38,lat+.23].map(n=>n.toFixed(5)).join('%2C');
 const url='https://www.openstreetmap.org/export/embed.html?bbox='+bbox+'&layer=mapnik'+(focus?'&marker='+lat+'%2C'+lng:'');
 return '<section class="card map-consumer"><div class="row-between wrap"><h3>Places on a map</h3>'+action('+ Save place','add-place','button button-primary button-small')+'</div><div class="map-online-frame"><iframe title="Online OpenStreetMap" loading="lazy" src="'+esc(url)+'" referrerpolicy="strict-origin-when-cross-origin"></iframe></div><div class="tiny muted">Online map · © OpenStreetMap contributors</div>'
  +(pins.length?'<div class="map-pin-list">'+pins.map(p=>'<div class="prepare-row"><strong>'+esc(p.name)+'</strong>'+link('Open map','https://www.openstreetmap.org/?mlat='+p.lat+'&mlon='+p.lng+'#map=14/'+p.lat+'/'+p.lng)+' '+link('Waze',wazeUrl(p))+'</div>').join('')+'</div>':'<p class="subtext">Save a place with coordinates to put a pin on the map.</p>')
  +'</section><details class="map-advanced"><summary>Offline maps and annotations</summary>'+technical+'</details>';
}
function annotationEditor(){const draft=state.mapDraft;if(!draft)return;
 const choices=state.trips.map(t=>`<option value="${esc(t.id)}" ${t.id===state.selectedTrip?'selected':''}>${esc(t.title)}</option>`).join('');
 openModal('Save geographic annotation',`<div class="alert blue" style="margin-bottom:16px">Annotations are visual reminders, not verified road geometry or directions. They remain on this device until an approved adapter is connected.</div>${field('label','Annotation name','','text','required maxlength="150"')}<div class="field"><label for="f-tripId">Associate with trip (optional)</label><select name="tripId" id="f-tripId"><option value="">General map note</option>${choices}</select></div>${textArea('notes','Description or observation','')}<p class="subtext">${draft.points.length} geographic point(s). Type: ${draft.kind}.</p>`,async f=>{const annotation=normalizeAnnotation({...f,kind:draft.kind,points:draft.points});await commit('annotation',annotation);state.mapDraft=null;state.mapFixedBounds=null;render();});
}
function renderOfflineReadiness(){const trip=selected();const report=assessOfflineTrip({trip,stops:state.stops,places:state.places,packing:state.packing,shellCached:state.shellCached,mapPackAvailable:false});return `<div class="card" style="margin-top:18px"><h3>Offline preparation</h3><p class="subtext">${esc(trip?.title||'No trip selected')} · ${report.cachedRecords} itinerary/packing records currently saved locally</p><div class="alert ${report.ready?'blue':'red'}" style="margin:12px 0">${report.ready?'Offline checks passed':'Not fully offline-ready'} — ${report.warnings.length} outstanding item(s)</div><ul class="offline-warnings">${report.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul><p class="subtext">${esc(report.caveat||'No trip selected.')}</p><div class="divider"></div><p class="subtext">Storage: ${esc(state.storageState)}. ${activePack()?(activePack().dataProfile==='osm-street-reference-v1'?'Offline OSM streets installed for reference, but NOT turn-by-turn navigation. ':'Imported geographic reference available; still NOT a verified offline road-navigation map. '):''}Imported map packs (GeoJSON, OSM, or tiled regional atlas) are local only and are <b>not included in travel-data backups</b>; export a separate portable map backup. IndexedDB data can be lost if the browser or device clears site storage; export a backup before departure.</p><div class="action-line">${action('Request persistent storage','request-persistence')}${action('Export backup','export-backup')}</div></div>`;}
async function checkOfflineShell(showResult=false){
  state.shellReport=await verifyOfflineShell({scope:new URL('./',location.href).href});
  state.shellCached=state.shellReport.ready;
  if(state.view==='more')render();
  if(showResult)toast(state.shellReport.ready?'Offline app shell cached on this device. Export backups regularly.':state.shellReport.reason,!state.shellReport.ready);
  return state.shellReport;
}
async function checkStorage(){try{const persisted=await navigator.storage?.persisted?.();const estimate=await navigator.storage?.estimate?.();const size=estimate?.usage!==undefined?` · ${(estimate.usage/1024/1024).toFixed(1)} MiB used`:'';state.storageState=(persisted?'Browser reports persistent storage':'Persistence not granted')+size;}catch{state.storageState='Browser storage estimate unavailable';}if(state.view==='more')render();}
function renderPreparation(t){
 const report=reviewTripPreparation({
  trip:t,stops:byTrip(state.stops),places:state.places,packing:byTrip(state.packing),
  expenses:byTrip(state.expenses),vehicle:state.vehicles.find(v=>v.id===t.vehicleId)||null,
  mapPacks:state.mapPacks,storageHealth:state.storageHealth
 });
 const steps=[
  ['schedule','Itinerary','itinerary'],
  ['pins','Places & directions','places'],
  ['packing','Packing list','packing'],
  ['budget','Trip budget','budget']
 ];
 const byId=new Map(report.items.map(i=>[i.id,i]));
 return '<section class="card prepare-panel"><div class="row-between wrap"><h3>Before you go</h3><span class="tiny muted">Trip checklist</span></div><div class="prepare-list">'
  +steps.map(([id,title,target])=>{
   const item=byId.get(id),ready=item?.status==='ok';
   return '<div class="prepare-row"><span class="prepare-state" aria-hidden="true">'+(ready?'✓':'○')+'</span><div class="prepare-copy"><strong>'+title+'</strong><small>'+(ready?'Reviewed':'Review before departure')+'</small></div>'+action('Open','prep-jump:'+target,'button button-small')+'</div>';
  }).join('')+'</div></section>';
}
function renderTrips(){const t=selected(),cards=state.trips.map(v=>`<article class="card trip-card interactive" data-action="choose-trip:${esc(v.id)}"><span class="dates">${dateShort(v.startDate)} — ${dateShort(v.endDate)}</span><h3 style="margin:7px 0">${esc(v.title)}</h3><p class="card-meta">${esc(v.timezone)} ${t?.id===v.id?'· Currently selected':''}</p></article>`).join('');return `${section('Your journeys',`${state.trips.length} planned trips`,action('+ New trip','new-trip','button button-primary button-small'))}${cards?`<div class="cards">${cards}</div>`:`<div class="placeholder"><b>Start planning your next journey.</b><span>Create a trip with departure and return dates, then add scheduled stops and a packing list.</span>${action('Create a trip','new-trip')}</div>`}${t?`<section class="trip-workspace"><div class="row-between wrap"><div><h2>${esc(t.title)}</h2><p class="subtext">${dateShort(t.startDate)} – ${dateShort(t.endDate)}</p></div><div class="row wrap">${action('Edit trip','edit-trip')}${action('+ Quick activity','add-stop','button button-small')}</div></div><div class="view-tabs"><button data-trip-tab="itinerary" class="${state.tripTab==='itinerary'?'active':''}">Itinerary</button><button data-trip-tab="calendar" class="${state.tripTab==='calendar'?'active':''}">Calendar</button><button data-trip-tab="packing" class="${state.tripTab==='packing'?'active':''}">Packing</button><button data-trip-tab="prepare" class="${state.tripTab==='prepare'?'active':''}">Prepare</button><button data-trip-tab="costs" class="${state.tripTab==='costs'?'active':''}">Budget</button><button data-trip-tab="info" class="${state.tripTab==='info'?'active':''}">Trip info</button></div>${state.tripTab==='itinerary'?renderItinerary(t):state.tripTab==='calendar'?renderTripCalendar(t):state.tripTab==='packing'?renderPacking(true):state.tripTab==='costs'?renderCosts(t):state.tripTab==='prepare'?renderPreparation(t):`<div class="card"><p>${esc(t.notes||'No trip notes yet.')}</p></div>`}</section>`:''}`;}
function itineraryInputRow(s=null,trip=null){
 const placeChoices=state.places.map(p=>`<option value="${esc(p.id)}" ${s?.placeId===p.id?'selected':''}>${esc(p.name)}</option>`).join('');
 return `<tr data-stop-id="${esc(s?.id||'')}" data-base-revision="${s?state.recordRevisions['stop:'+s.id]??0:0}"><td><input type="time" aria-label="Time" data-day-field="time" value="${esc(s?.time||'')}"></td><td><input type="text" aria-label="Activity" data-day-field="title" maxlength="150" placeholder="Breakfast, drive, hotel…" value="${esc(s?.title||'')}"></td><td><input type="number" aria-label="Minutes" data-day-field="durationMinutes" min="0" max="10080" value="${s?.durationMinutes??0}"></td><td><select aria-label="Activity type" data-day-field="kind">${selOptions(STOP_KINDS,s?.kind||'Activity')}</select></td><td><select aria-label="Saved place" data-day-field="placeId"><option value="">No pin</option>${placeChoices}</select></td><td><input type="checkbox" aria-label="Fixed booking" data-day-field="fixed" ${s?.fixed?'checked':''}></td><td>${s?action('More','edit-stop:'+s.id,'button button-small'):''}</td></tr>`;
}
async function saveItineraryGrid(){
 const trip=selected(),tbody=$('#itinerary-grid-body');if(!trip||!tbody)throw Error('Open a trip itinerary first.');
 const everyRow=[...tbody.querySelectorAll('tr')];if(everyRow.some(row=>row.dataset.stopId&&!row.querySelector('[data-day-field="title"]')?.value.trim()))throw Error('Existing activities need a title. Use More to delete an activity.');
 const rows=everyRow.filter(row=>row.querySelector('[data-day-field="title"]')?.value.trim());
 if(!rows.length)throw Error('Enter at least one activity.');if(rows.length>80)throw Error('Save up to 80 activities per day.');
 const list=rows.map((row,index)=>{
  const old=state.stops.find(s=>s.id===row.dataset.stopId);if(row.dataset.stopId&&!old)throw Error('An activity was removed elsewhere. Reopen your trip before editing.');
  const form=Object.fromEntries([...row.querySelectorAll('[data-day-field]')].map(el=>[el.dataset.dayField,el.type==='checkbox'?el.checked:el.value]));
  const base=old?{...old}:{tripId:trip.id,sortOrder:1000000+index};
  return normalizeStop({...base,...form,date:state.chosenDay,createdAt:old?.createdAt,fixed:form.fixed},trip);
 });
 const revisions={},presence={};for(const item of list){const row=rows.find(r=>r.dataset.stopId===item.id);const key='stop:'+item.id;revisions[key]=row?Number(row.dataset.baseRevision):0;presence[key]=Boolean(row);}
 await writeLocally(()=>guardedSaveRecords(state.db,'stop',list,{expectedEpoch:state.workspaceEpoch,expectedRevisionByKey:revisions,expectedPresenceByKey:presence}));
}
function renderItinerary(t){
 if(!state.chosenDay||state.chosenDay<t.startDate||state.chosenDay>t.endDate)state.chosenDay=t.startDate;
 const {index:chosenIndex,count:dayCount}=tripDayPosition(t,state.chosenDay);
 const strip=nearbyTripDays(t,state.chosenDay,dayCount<=14?Math.min(dayCount,14):7);
 const entries=itineraryOrder(byTrip(state.stops).filter(s=>s.date===state.chosenDay));
 const issues=conflicts(entries),travelIssues=travelFeasibility(entries);
 return `<div class="day-tools"><button class="button button-small" data-action="day-prev" ${chosenIndex===0?'disabled':''}>←</button><label for="trip-day"><strong>Day ${chosenIndex+1} of ${dayCount}</strong></label><input class="button" id="trip-day" type="date" min="${t.startDate}" max="${t.endDate}" value="${state.chosenDay}"><button class="button button-small" data-action="day-next" ${chosenIndex===dayCount-1?'disabled':''}>→</button></div>
 <div class="day-strip" role="group" aria-label="Select itinerary day">${strip.map(date=>`<button class="day-tile ${date===state.chosenDay?'active':''}" aria-pressed="${date===state.chosenDay}" data-action="select-day:${date}"><span>${new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'short'}).format(new Date(date+'T12:00:00Z'))}</span><strong>${date.slice(8)}</strong></button>`).join('')}</div>
 <section class="itinerary-editor"><div class="row-between wrap"><div><h3>Day ${chosenIndex+1} · ${dateShort(state.chosenDay)}</h3></div><div class="action-line">${action('View map','show-map')}${action('Copy day','brief-copy-day')}</div></div>
 <div class="sheet-scroll"><table class="itinerary-table"><thead><tr><th>Time</th><th>Activity / stop</th><th>Min</th><th>Type</th><th>Place</th><th>Fixed</th><th></th></tr></thead><tbody id="itinerary-grid-body">${entries.map(s=>itineraryInputRow(s,t)).join('')}${Array.from({length:2},()=>itineraryInputRow(null,t)).join('')}</tbody></table></div>
 <div class="editorial-actions">${action('+ Row','add-itinerary-row','button button-small')}${action('Save day','save-itinerary-grid','button button-primary button-small')}</div></section>
 ${(issues.length||travelIssues.some(i=>i.kind==='insufficient-transfer-time'))?`<div class="alert red" style="margin-top:10px">Check your schedule: some activities overlap or leave insufficient travel time.</div>`:''}`;
}
function renderTripCalendar(t){
 if(!state.chosenDay||state.chosenDay<t.startDate||state.chosenDay>t.endDate)state.chosenDay=t.startDate;
 const earliest=t.startDate.slice(0,7),latest=t.endDate.slice(0,7);
 if(!state.calendarMonth||state.calendarMonth<earliest||state.calendarMonth>latest)state.calendarMonth=state.chosenDay.slice(0,7);
 const month=state.calendarMonth;
 const monthLast=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
 const all=tripCalendar(t,byTrip(state.stops),`${month}-01`,monthLast);
 const [year,mon]=month.split('-').map(Number),firstDay=new Date(Date.UTC(year,mon-1,1)).getUTCDay(),count=new Date(Date.UTC(year,mon,0)).getUTCDate();
 const cells=Array.from({length:firstDay},()=>'<span aria-hidden="true"></span>');
 const map=new Map(all.map(d=>[d.date,d]));
 for(let day=1;day<=count;day++){
  const date=`${month}-${String(day).padStart(2,'0')}`,entry=map.get(date);
  cells.push(entry?`<button class="calendar-day ${date===state.chosenDay?'active':''}" data-action="calendar-day:${date}" aria-label="Day ${day}, ${entry.count} activities" aria-pressed="${date===state.chosenDay}"><strong>${day}</strong><span>${entry.count?`${entry.count} stop${entry.count===1?'':'s'}`:'Open day'}</span></button>`:`<span class="calendar-day other-month">${day}</span>`);
 }
 const prev=new Date(Date.UTC(year,mon-2,1)).toISOString().slice(0,7),next=new Date(Date.UTC(year,mon,1)).toISOString().slice(0,7);
 const monthLabel=new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${month}-01T12:00:00Z`));
 const dayDetail=map.get(state.chosenDay);
 return `<div class="card"><div class="row-between wrap"><h3>${esc(monthLabel)}</h3><div class="action-line" style="margin:0"><button class="button button-small" data-action="calendar-month:${prev}" ${prev<earliest?'disabled':''}>← Month</button><button class="button button-small" data-action="calendar-month:${next}" ${next>latest?'disabled':''}>Month →</button></div></div><p class="subtext">TravelIt's internal calendar. LiveIt synchronization is not yet connected.</p><div class="calendar-grid"><div class="calendar-weekday">Sun</div><div class="calendar-weekday">Mon</div><div class="calendar-weekday">Tue</div><div class="calendar-weekday">Wed</div><div class="calendar-weekday">Thu</div><div class="calendar-weekday">Fri</div><div class="calendar-weekday">Sat</div>${cells.join('')}</div></div><div class="card" style="margin-top:12px">${section(state.chosenDay,`${dayDetail?.count||0} activities`,action('Open day in itinerary','calendar-open-day'))}${(dayDetail?.stops||[]).length?dayDetail.stops.map(renderStop).join(''):'<p class="subtext">No activities saved for this date.</p>'}</div>`;
}
function renderStop(s){const p=placeById(s.placeId);return `<div class="schedule-item"><div class="schedule-time">${s.time||'Flexible'}</div><div class="schedule-main"><div class="schedule-title">${esc(s.title)}</div><div class="schedule-desc">${esc(s.kind)}${s.durationMinutes?` · ${s.durationMinutes} min`:''}${s.fixed?' · Fixed booking':''}${s.legDistanceKm!==null&&s.legDistanceKm!==undefined?' · Incoming drive '+s.legDistanceKm+' km':''}${s.legTravelMinutes!==null&&s.legTravelMinutes!==undefined?' / '+s.legTravelMinutes+' min (estimated)':''}${p?` · ${esc(p.name)}`:''}</div>${s.notes?`<p class="subtext">${esc(s.notes)}</p>`:''}<div class="action-line">${!s.time&&!s.fixed?`${action('↑','move-flex-up:'+s.id,'button button-small','aria-label="Move flexible activity earlier"')}${action('↓','move-flex-down:'+s.id,'button button-small','aria-label="Move flexible activity later"')}`:''}${action('Edit','edit-stop:'+s.id,'button button-small')}${p&&wazeUrl(p)?link('Waze',wazeUrl(p)):''}${action('Remove','delete-stop:'+s.id,'button button-small button-danger')}</div></div></div>`;}
function renderRoadQuickList(queue,nextId){
 const remaining=queue.items.filter(item=>item.id!==nextId).slice(0,3);
 return `<section class="road-quick card" aria-label="Upcoming stops"><div class="row-between wrap"><h3>Following stops</h3><span class="subtext">Saved itinerary · not live GPS</span></div>
 ${queue.earlierTimedCount?`<p class="subtext">${queue.earlierTimedCount} earlier timed item(s) omitted from this quick list; see full schedule below. Their completion is not tracked.</p>`:''}
 ${remaining.length?remaining.map((item,i)=>`<article class="road-stop"><span class="road-stop-number">${i+2}</span><div class="road-stop-content"><div class="road-stop-title">${esc(item.title)}</div><p class="subtext">${esc(item.time||'Time not set')} · ${esc(item.kind)}${item.fixed&&!item.time?' · Booking time missing':''}</p>
 <div class="road-stop-actions">${item.navUrl?link('Waze',item.navUrl):`<span class="chip">${item.pinStatus==='no-associated-place'?'No place linked':'Pin missing'}</span>`}${item.sourceUrl?link('Saved link',item.sourceUrl):''}</div>
 ${item.legDistanceKm!==null||item.legTravelMinutes!==null?`<p class="subtext">Incoming leg (manually entered): ${item.legDistanceKm===null?'distance unknown':esc(item.legDistanceKm)+' km'} · ${item.legTravelMinutes===null?'duration unknown':esc(item.legTravelMinutes)+' min'}</p>`:''}</div></article>`).join(''):'<p class="subtext">No additional upcoming stops. Use the full day schedule below to review earlier timed activities.</p>'}
 ${queue.omittedCount?`<p class="subtext">${queue.omittedCount} more item(s) in full schedule.</p>`:''}</section>`;
}
function renderToday(){
 const now=new Date(),trip=pickTodayTrip(state.trips,now,state.selectedTrip);
 if(!trip)return `<section class="empty-essentials"><strong>No trip scheduled</strong>${action('Plan a trip','new-trip','button button-primary button-small')}</section>`;
 const date=trip.localDate,onTrip=trip.onTrip,filtered=itineraryOrder(state.stops.filter(s=>s.tripId===trip.id&&s.date===(onTrip?date:trip.startDate)));
 const clock=tripClock(now,trip.timezone),nextDecision=nextTodayStop(filtered,clock,{onTrip}),next=nextDecision.stop,p=next?.placeId?placeById(next.placeId):null;
 const firstImage=state.places.find(q=>q.coverImage&&filtered.some(x=>x.placeId===q.id));
 return `<section class="journal-intro today-intro ${firstImage?'has-cover':''}"><div><span class="eyebrow">${onTrip?'TODAY ON THE ROAD':'UPCOMING JOURNEY'}</span><h2>${esc(trip.title)}</h2><p>${esc(dateShort(onTrip?date:trip.startDate))} · ${filtered.length} planned ${filtered.length===1?'stop':'stops'}</p>${action('Open itinerary','today-open-trip','button button-primary button-small')}</div>${firstImage?`<div class="journal-intro-cover">${placeCover(firstImage)}</div>`:''}</section>
 ${next?`<div class="next-moment"><span class="eyebrow">NEXT STOP</span><h3>${esc(next.title)}</h3><p>${esc(next.time||'Whenever you are ready')}${p?' · '+esc(p.name):''}</p><div class="story-actions">${p&&wazeUrl(p)?link('Directions',wazeUrl(p)):''}${p?.sourceUrl?link('Saved link',p.sourceUrl):''}</div></div>`:''}
 <section class="editorial-schedule"><div class="journal-heading"><div><span class="eyebrow">THE DAY AHEAD</span><h2>Our itinerary</h2></div>${action('Edit day','today-open-trip')}</div>${filtered.length?filtered.map(s=>`<div class="editorial-stop"><span>${esc(s.time||'—')}</span><div><strong>${esc(s.title)}</strong><p>${esc(s.kind)}${s.durationMinutes?' · '+s.durationMinutes+' min':''}</p></div></div>`).join(''):'<div class="quiet-empty"><strong>No stops planned yet.</strong><p>Add an activity from your trip itinerary.</p></div>'}</section>`;
}
async function savePackingBatch(){
 const trip=selected(),body=$('#packing-draft-body');if(!trip||!body)throw Error('Choose a trip and enter packing items first.');
 const rows=[...body.querySelectorAll('tr')].map(row=>Object.fromEntries([...row.querySelectorAll('[data-packing-field]')].map(input=>[input.dataset.packingField,input.value]))).filter(row=>String(row.label||'').trim());
 if(!rows.length)throw Error('Enter at least one item.');if(rows.length>60)throw Error('Save at most 60 items at a time.');
 const unique=new Set(byTrip(state.packing).map(i=>i.label.trim().toLocaleLowerCase()));
 const items=rows.map(row=>{const normalized=normalizePacking(row,trip);const label=normalized.label.toLocaleLowerCase();if(unique.has(label))throw Error(`Already on your list: ${normalized.label}`);unique.add(label);return normalized;});
 await writeLocally(()=>guardedSaveRecords(state.db,'packing',items,{expectedEpoch:state.workspaceEpoch,expectedRevisionByKey:Object.fromEntries(items.map(i=>[`packing:${i.id}`,0])),expectedPresenceByKey:Object.fromEntries(items.map(i=>[`packing:${i.id}`,false]))}));toast(`${items.length} packing items saved on this device.`);
}
function packingDraftRow(){return `<tr class="packing-draft-row"><td><input type="text" aria-label="Item" maxlength="150" data-packing-field="label" placeholder="Add an item"></td><td><input type="number" aria-label="Quantity" min="1" max="999" value="1" data-packing-field="quantity"></td><td><select aria-label="Category" data-packing-field="category">${selOptions(PACK_CATEGORIES,'Essentials')}</select></td><td><input type="text" aria-label="Who packs it" maxlength="80" data-packing-field="owner" placeholder="Optional"></td></tr>`;}
function renderPacking(compact=false){
 const t=selected();if(!t)return `${section('Packing','Choose a trip first')}<div class="placeholder"><b>Choose a trip to prepare a packing list.</b>${action('Open trips','open-trips')}</div>`;
 const items=byTrip(state.packing),packed=items.filter(p=>p.packed).length,pct=items.length?Math.round(100*packed/items.length):0;
 return `${!compact?section('Packing',esc(t.title)):''}<section class="card packing-sheet" aria-label="Packing table"><div class="row-between wrap"><div><h3>Packing for ${esc(t.title)}</h3><p class="subtext">${packed} of ${items.length} ready</p></div>${action('Mind map','packing-mindmap','button button-primary button-small')}${action('Use template','packing-template','button button-small')}</div><div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div style="width:${pct}%"></div></div>
 ${items.length?`<div class="sheet-scroll"><table class="packing-table"><thead><tr><th scope="col">Packed</th><th scope="col">Item</th><th scope="col">Qty</th><th scope="col">Category</th><th scope="col">Actions</th></tr></thead><tbody>${items.map(i=>`<tr><td><input type="checkbox" id="pack-${esc(i.id)}" data-pack-id="${esc(i.id)}" aria-label="Packed ${esc(i.label)}" ${i.packed?'checked':''}></td><td><label for="pack-${esc(i.id)}" class="${i.packed?'done':''}">${esc(i.label)}${i.owner?` <small class="muted">· ${esc(i.owner)}</small>`:''}</label></td><td>${i.quantity}</td><td>${esc(i.category)}</td><td class="table-actions">${action('Edit','edit-pack:'+i.id,'button button-small')}${action('✕','delete-pack:'+i.id,'button button-small button-ghost','aria-label="Remove item"')}</td></tr>`).join('')}</tbody></table></div>`:'<p class="subtext">Your list is empty. Add several items in the table below.</p>'}
 <h3 class="packing-add-title">Add multiple items</h3><div class="sheet-scroll"><table class="packing-table packing-entry"><thead><tr><th scope="col">Item</th><th scope="col">Qty</th><th scope="col">Category</th><th scope="col">Person</th></tr></thead><tbody id="packing-draft-body">${Array.from({length:4},packingDraftRow).join('')}</tbody></table></div><div class="action-line">${action('+ Add row','packing-add-row','button button-small')}${action('Save all new items','packing-save-rows','button button-primary button-small')}</div><p class="tiny muted">Fill several rows, then save them together. Your list stays available on this device.</p></section>`;
}
function renderPhotos(){
 const covers=state.places.filter(p=>p.coverImage);
 return covers.length?`<div class="library-toolbar"><div><span class="count-label">${covers.length} saved covers</span></div>${action('Saved places','go-explore','button button-small')}</div><div class="photo-story-grid">${covers.map(p=>`<button class="photo-story" data-action="place:${esc(p.id)}" aria-label="View ${esc(p.name)}">${placeCover(p)}<span>${esc(p.name)}</span></button>`).join('')}</div>`:`<section class="empty-essentials"><strong>No photos yet</strong><span>Add a cover to a saved place.</span>${action('Browse places','go-explore','button button-primary button-small')}</section>`;
}
function renderMoreTechnical(){return `${section('Library & settings','Your data stays in this local TravelIt workspace')}<div class="grid2"><div class="card"><h3>Local backup and recovery</h3><p class="subtext">Export TravelIt domain records, including any external KeepIt reference links, and local-only change history as JSON. This does not export the actual KeepIt notes, embedded assets, or verified sync receipts. Do not include sensitive documents: this backup is <strong>not encrypted</strong>.</p><div class="action-line">${action('Export backup','export-backup','button button-primary button-small')}${action('Restore backup','import-backup')}</div>${state.recovery?`<div class="alert blue" style="margin-top:12px"><strong>Previous workspace available</strong><p class="subtext">Snapshot created ${esc(state.recovery.savedAt)} · ${state.recovery.records} records</p><div class="action-line">${action('Undo last restore','undo-restore','button button-small')}</div></div>`:''}<div class="divider"></div><p class="tiny muted">Never clear browser data, uninstall the PWA, or switch devices without exporting and verifying a backup. Browser storage is not guaranteed permanent.</p></div><div class="card"><h3>Local data diagnostics</h3><div class="divider"></div><h4>Offline startup check</h4><p class="subtext">Verify that every application-shell file is actually cached. A registered service worker alone does not prove offline availability.</p><div class="action-line">${action('Verify offline shell','verify-offline-shell','button button-primary button-small')}</div>${state.shellReport?`<div role="status" class="alert ${state.shellReport.ready?'blue':'red'}" style="margin-top:10px"><b>${state.shellReport.ready?'Cached for this browser':'Offline shell not verified'}</b><p>${esc(state.shellReport.cached)}/${esc(state.shellReport.total)} required files cached · ${esc(state.shellReport.reason)}</p>${state.shellReport.missing.length?`<p class="tiny">Missing: ${esc(state.shellReport.missing.slice(0,5).join(', '))}${state.shellReport.missing.length>5?' …':''}</p>`:''}</div>`:'<p class="subtext">Not checked yet. This app does not claim offline readiness merely because it has a service worker.</p>'}<div class="divider"></div><p class="subtext">Checks this browser's database for successful temporary write/readback and scans existing records for broken references. This does not prove data survives device clearing or confirm cloud sync.</p><div class="action-line">${action('Run local diagnostic','run-local-diagnostic','button button-primary button-small')}</div>${state.storageHealth?`<div class="alert ${state.storageHealth.ok?'blue':'red'}" style="margin-top:10px">${esc(state.storageHealth.message)}</div>`:''}${state.localAudit?`<p class="subtext" style="margin-top:10px">${state.localAudit.recordCount} records · ${state.localAudit.errors} error(s) · ${state.localAudit.warnings} warning(s) · ${state.localAudit.commandCount} local-only changes</p>${state.localAudit.issues.length?`<ul class="offline-warnings">${state.localAudit.issues.slice(0,15).map(i=>`<li>${esc(i.code)}: ${esc(i.detail)} (${esc(i.entity)})</li>`).join('')}</ul>${state.localAudit.issues.length>15?'<p>Additional issues omitted from this view.</p>':''}`:'<p class="subtext">No relationship problems detected in the scanned records.</p>'}`:''}<p class="tiny muted">Backups are still required. A successful probe proves only immediate write/readback on this device.</p></div><div class="card"><h3>Integration status</h3><div class="row-between" style="margin-top:13px"><span>KeepIt Notes and document assets</span><span class="tag yellow">Not connected</span></div><p class="tiny muted">${state.keepitAssociations.length} saved native-note reference(s), if any, are external dependencies—not backed-up note content. Native notes are not connected in this standalone version.</p><div class="row-between" style="margin-top:13px"><span>LiveIt calendar</span><span class="tag yellow">Not connected</span></div><div class="row-between" style="margin-top:13px"><span>Offline GeoJSON reference maps</span><span class="tag ${activePack()?'':'yellow'}">${activePack()?'Imported locally':'No map loaded'}</span></div><div class="divider"></div><p class="subtext">${state.outbox.length} local change command(s) retained, not synchronized. Do not interpret this count as pending successful cloud delivery.</p></div><div class="card"><h3>Photo library</h3><div class="photo-placeholder" aria-hidden="true">▧</div><p class="subtext">The full travel-photo gallery will link to KeepIt media after the approved read-only bridge is verified. No personal images are imported into this local foundation.</p></div><div class="card"><h3>Travel documents</h3><div class="alert red" style="margin:13px 0"><b>Do not import passports, IDs, or tickets here.</b> Protected KeepIt previews, encryption at rest, and device authentication are required before this feature can be enabled.</div><p class="subtext">The document-wallet contract is in the specification package; this build contains no insecure substitute.</p></div>${renderVehicles()}</div>`;}
function renderMore(){
 return `<section class="essential-library"><div class="essential-row"><div><h3>Backup</h3><p class="tiny muted">Not encrypted. Keep your backup private.</p></div><div class="action-line">${action('Export','export-backup','button button-primary button-small')}${action('Restore','import-backup','button button-small')}</div></div><div class="essential-row"><div><h3>Vehicles</h3><p class="tiny muted">${state.vehicles.length} saved</p></div><div class="action-line">${action('+ Add','add-vehicle','button button-small')}</div></div>${state.vehicles.length?`<div class="vehicle-inline-list">${state.vehicles.map(v=>`<div class="row-between"><span>${esc(v.name)}</span>${action('Edit','edit-vehicle:'+v.id,'button button-small')}</div>`).join('')}</div>`:''}</section><details class="advanced-diagnostics"><summary>Advanced</summary>${renderMoreTechnical()}${renderOfflineReadiness()}</details>`;
}
function render(){renderNav();$('#today-shortcut').hidden=true;$('#quick-save').hidden=state.view!=='explore';$('#page-heading').textContent=({explore:'Explore',map:'Map pins',trips:'My Trips',today:'Today',packing:'Packing',photos:'Photos',more:'My Library'})[state.view]||'Explore';colorStatus();$('#main').innerHTML=state.view==='explore'?renderExplore():state.view==='map'?renderMap():state.view==='trips'?renderTrips():state.view==='today'?renderToday():state.view==='packing'?renderPacking():state.view==='photos'?renderPhotos():renderMore();}
function placeDetails(id){const p=placeById(id);if(!p)return toast('Place not found',true);const map=p.lat!==null?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.lat+','+p.lng)}`:null;openModal(p.name,`<div class="stack"><div class="row wrap"><span class="tag">${esc(p.category)}</span><span class="chip">${p.lat!==null?`${p.lat}, ${p.lng}`:'Location not pinned'}</span></div>${p.notes?`<p>${esc(p.notes)}</p>`:'<p class="muted">No note added yet.</p>'}${p.sourceUrl?`<div><strong>Original discovery link</strong><p class="subtext" style="overflow-wrap:anywhere">${esc(p.sourceUrl)}</p>${link('Open original source',p.sourceUrl)}</div>`:''}<div class="action-line">${p.lat!==null?`${link('Navigate with Waze',wazeUrl(p))} ${link('View in Google Maps',map)}`:''}<button type="button" class="button" id="detail-edit">Edit place</button><button type="button" class="button button-danger" id="detail-delete">Delete place</button></div></div>`);$('#detail-edit').addEventListener('click',()=>placeEditor(p));$('#detail-delete').addEventListener('click',async()=>{if(confirm(`Delete saved place “${p.name}”? Any trip stop referencing it retains its text but loses the pin.`)){closeModal();await erase('place',p.id);}});}
async function exportBackup(){const data=await allData(state.db);const backup=await createBackup(data);const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`TravelIt_VerifiedBackup_${new Date().toISOString().slice(0,10)}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('SHA-256 protected backup generated. Store a separate copy safely.');}
/** No source data are written until the user has seen the verified backup impact. */
async function readVerifiedRestoreFile(file){
 if(!file)throw Error('Choose a backup file.');
 if(file.size>25*1024*1024)throw Error('Backup exceeds 25 MB.');
 let data;try{data=JSON.parse(await file.text());}catch{throw Error('Backup is not valid JSON.');}
 return verifyBackup(data);
}
function restorePreviewMarkup(impact,legacy){
 const t=impact.totals;
 const types=Object.entries(impact.byType).filter(([,v])=>v.current||v.incoming);
 return `<div class="alert red"><b>${legacy?'Legacy backup — no original checksum':'SHA-256 verified backup'}</b><p>${t.current} current → ${t.incoming} imported records. ${t.added} new, ${t.overwritten} updated, ${t.removed} removed, ${t.unchanged} unchanged.</p><p>${impact.localCommandsDiscarded} unsent local command(s) will be replaced with ${impact.importedCommands} imported command(s). These commands have NOT reached KeepIt or LiveIt.</p></div><div class="subtext" style="margin-top:8px"><b>Record changes by category</b><ul class="offline-warnings">${types.map(([type,v])=>`<li>${esc(type)}: +${v.added} new, ${v.overwritten} updated, −${v.removed} removed</li>`).join('')}</ul></div><p class="subtext">Existing offline map packages remain in this browser and are not included in the backup. The previous single-level recovery snapshot will be replaced. Export your current workspace before restoring.</p>`;
}
function importBackup(){
 openModal('Restore local backup',`<div class="alert red" style="margin-bottom:18px"><b>This replaces every TravelIt record on this device.</b> Export the current data first. This operation does not merge workspaces.</div><div class="field"><label for="restore-file">Select a TravelIt JSON backup</label><input id="restore-file" type="file" accept=".json,application/json" required></div><div id="restore-impact" role="status" aria-live="polite" class="subtext">Select a backup to preview the changes before restoring it.</div><p class="subtext">Nothing is uploaded. Current backup versions are SHA-256 checked; legacy version 1 has no original checksum. Maps are backed up separately.</p>`,async(_f,form)=>{
  const file=form.querySelector('#restore-file').files?.[0];
  const {backup,legacy}=await readVerifiedRestoreFile(file);
  const impact=restoreImpact(await allData(state.db),backup);
  const t=impact.totals;
  if(!confirm(`Replace local TravelIt data? ${t.added} new, ${t.overwritten} updated, ${t.removed} removed; ${impact.localCommandsDiscarded} unsent local command(s) replaced.${legacy?' This old backup has no original checksum.':''} Proceed?`))throw Error('Restore cancelled; no records changed.');
  await restore(state.db,backup,{expectedWorkspaceRevision:modalBaseRevisions.__workspaceRevision??state.workspaceRevision});
  workspaceChannel?.announce('restore');state.selectedTrip=null;state.mapDraft=null;state.mapFixedBounds=null;
  await refresh();render();toast(legacy?'Legacy backup restored; export a new verified backup.':'Verified backup restored. Previous workspace retained for undo.');
 },'Restore and replace');
 let previewToken=0;
 const input=$('#restore-file'),report=$('#restore-impact');
 input.addEventListener('change',async()=>{
  const requestId=++previewToken, file=input.files?.[0];
  if(!file){report.textContent='Select a backup to preview changes.';return;}
  report.textContent='Checking backup checksum and comparing local records…';
  try{
   const [{backup,legacy},current]=await Promise.all([readVerifiedRestoreFile(file),allData(state.db)]);
   if(requestId!==previewToken||!input.isConnected)return;
   report.innerHTML=restorePreviewMarkup(restoreImpact(current,backup),legacy);
  }catch(error){if(requestId===previewToken&&input.isConnected)report.textContent='Cannot preview backup: '+(error.message||String(error));}
 });
}
function planSavedPlace(placeId){
 const place=placeById(placeId);if(!place)throw Error('Saved place was not found.');
 if(!state.trips.length){toast('Create a trip first, then add this saved place.',true);state.view='trips';render();return;}
 const current=selected()||state.trips[0];
 const kind=place.category==='Restaurant'?'Meal':place.category==='Hotel'?'Hotel':'Activity';
 openModal('Add saved place to a trip',`<div class="alert blue" style="margin-bottom:12px"><b>${esc(place.name)}</b><p>This links the existing saved place to an itinerary entry. The original reel, pin and place record remain unchanged.</p></div><div class="form-grid"><div class="field"><label for="f-tripId">Trip</label><select name="tripId" id="f-tripId">${state.trips.map(t=>`<option value="${esc(t.id)}" ${current.id===t.id?'selected':''}>${esc(t.title)}</option>`).join('')}</select></div>${field('date','Activity date',current.startDate,'date','required')}${field('time','Start time (optional)','','time')}${field('durationMinutes','Duration (minutes)',0,'number','min="0" max="10080" step="1"')}${textArea('notes','Reason to visit or booking reference','')}</div>`,async f=>{
  const trip=tripById(f.tripId);if(!trip)throw Error('Choose a valid trip.');
  const stop=normalizeStop({tripId:trip.id,placeId:place.id,title:place.name,date:f.date,time:f.time,durationMinutes:f.durationMinutes,kind,notes:f.notes,sortOrder:1000000},trip);
  await commit('stop',stop);state.selectedTrip=trip.id;state.chosenDay=f.date;state.tripTab='itinerary';state.view='trips';render();toast('Destination linked to trip locally. No cloud sync.');
 });
 const dateInput=$('#f-date'),tripInput=$('#f-tripId');
 tripInput.addEventListener('change',()=>{const t=tripById(tripInput.value);if(t){dateInput.min=t.startDate;dateInput.max=t.endDate;dateInput.value=t.startDate;}});
 dateInput.min=current.startDate;dateInput.max=current.endDate;
}
async function installAtlasPayload(source){
 const {manifest,tiles}=await prepareRegionAtlas(source);
 if(state.mapPacks.some(p=>p.regionAtlas&&p.contentSha256===manifest.contentSha256))throw Error('This regional atlas is already installed; the duplicate was not added.');
 const size=new TextEncoder().encode(JSON.stringify(source)).byteLength;
 const estimate=await navigator.storage?.estimate?.();
 if(Number.isFinite(estimate?.quota)&&Number.isFinite(estimate?.usage)&&estimate.quota-estimate.usage<size*2.5)throw Error('Insufficient reported storage headroom for this map. Existing maps were not changed.');
 await putAtlasRegion(state.db,manifest,tiles,{expectedMapRevision:modalBaseMapRevision,activate:manifest.id,rejectExisting:true});
 state.atlasRequest++;state.atlasView=null;state.atlasLoading=null;state.atlasAudit=null;
 await finishMapChange();state.mapFixedBounds=null;state.mapDraft=null;state.view='map';render();
 toast(`Installed ${manifest.tileCount} verified geographic cells locally. Road reference only; no routing.`);
 return manifest;
}
function importRegionAtlas(){
 openModal('Install a regional offline street atlas',`<div class="alert blue" style="margin-bottom:14px"><strong>Import a prepared regional atlas.</strong> The selected file will be validated before being installed. It contains legally sourced street reference geometry, NOT calculated routes or navigation. Keep the original file as an independent backup; no subscription is required.</div><div class="field"><label for="region-atlas-file">Regional atlas package (maximum 25 MiB)</label><input id="region-atlas-file" type="file" accept=".json,.travelatlas,application/json" required></div><p class="subtext">Prefer the new <b>Create from GeoJSON</b> option if you have a locally saved road GeoJSON source. Prepared atlases can also be created with the included Python builder.</p>`,async(_f,form)=>{
  const file=form.querySelector('#region-atlas-file').files?.[0];if(!file)throw Error('Select a regional atlas JSON file.');
  if(file.size>ATLAS_LIMITS.bytes)throw Error('Atlas exceeds 25 MiB. Prepare a smaller region.');
  let source;try{source=JSON.parse(await file.text());}catch{throw Error('Invalid regional atlas JSON file.');}
  const counts=validateAtlasPayload(source);
  if(!confirm(`Install ${source.name}\n${counts.tileCount} cells · ${counts.featureCount} reference segments\nLicense: ${source.license}\n\nThis is NOT an offline navigation map. Continue?`))return;
  await installAtlasPayload(source);
 },'Validate and install');
}
function createRegionalAtlas(){
 openModal('Create regional atlas on this device',`<div class="alert blue" style="margin-bottom:12px"><strong>No account or subscription.</strong> Choose an already-downloaded <b>GeoJSON road extract</b> whose offline use is permitted. TravelIt prepares geographic cells directly on this device, checks the result, then installs it. This is a reference street map, not offline routing, traffic or navigation. Large extracts must still use the desktop preparation script.</div><div class="form-grid"><div class="field full"><label for="atlas-source-file">Road GeoJSON (maximum 6 MiB)</label><input id="atlas-source-file" type="file" accept=".geojson,.json,application/geo+json,application/json" required></div>${field('atlasName','Region name','','text','required maxlength="120"')}${field('atlasLicense','Source data license / permission','ODbL 1.0','text','required maxlength="120"')}${field('atlasAttribution','Required attribution','© OpenStreetMap contributors','text','required maxlength="280"')}${field('atlasSourceUrl','Original data URL, if known','','url')}</div><p class="subtext">Only known road/path/waterway attributes are imported; proposed and construction roads are omitted. The importer never downloads map tiles or accesses a paid API. Supply the correct attribution for your actual source.</p>`,async(_f,form)=>{
  const file=form.querySelector('#atlas-source-file').files?.[0];if(!file)throw Error('Choose a local road GeoJSON file.');
  if(file.size>SELF_SERVICE_LIMITS.sourceBytes)throw Error('The local GeoJSON input limit is 6 MiB; choose a smaller extract.');
  let source;try{source=JSON.parse(await file.text());}catch{throw Error('Selected file is not valid GeoJSON.');}
  const opts={name:form.querySelector('#f-atlasName').value,license:form.querySelector('#f-atlasLicense').value,attribution:form.querySelector('#f-atlasAttribution').value,sourceUrl:form.querySelector('#f-atlasSourceUrl').value};
  const result=buildAtlasFromRoadGeoJSON(source,opts);
  if(!confirm(`Prepare ${result.name}\n${result.tileCount} geographic cells · ${result.featureCount} street-reference segments\nLicense: ${result.license}\n\nKeep the original source GeoJSON separately. Install now?`))return;
  await installAtlasPayload(result);
 },'Build and install on this device');
}
async function auditSelectedAtlas(){
 const pack=activePack();if(!pack?.regionAtlas)throw Error('Select a regional street atlas to verify.');
 state.atlasAudit={status:'checking',name:pack.name,packId:pack.id};render();
 try{
  const result=await inspectInstalledAtlas(pack,descriptors=>getAtlasTiles(state.db,pack.id,descriptors));
  state.atlasAudit={status:result.ok?'valid':'damaged',name:pack.name,packId:pack.id,...result};render();
  toast(result.ok?`Verified all ${result.verified} stored atlas cells.`:`${result.failed} atlas cell(s) failed verification.`,!result.ok);
 }catch(e){state.atlasAudit={status:'error',name:pack.name,packId:pack.id,message:e.message};render();toast(e.message,true);}
}
async function exportSelectedAtlas(){
 const pack=activePack();if(!pack?.regionAtlas)throw Error('Select a regional atlas first.');
 const result=await inspectInstalledAtlas(pack,descriptors=>getAtlasTiles(state.db,pack.id,descriptors),{exportPayload:true});
 const safeName=pack.name.replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'').slice(0,55)||'region';
 downloadJSONFile(result.payload,`TravelIt_Atlas_${safeName}.travelatlas.json`);
 state.atlasAudit={status:'valid',name:pack.name,packId:pack.id,...result.status};render();
 toast(`Verified and exported ${result.status.verified} atlas cells. Keep this file outside browser storage.`);
}
function importMapPack(){
 openModal('Import offline geographic data',`<div class="alert blue" style="margin-bottom:14px"><strong>Offline maps with no subscription.</strong> Choose a small GeoJSON FeatureCollection that you downloaded or prepared legally. TravelIt does not scrape OpenStreetMap tile servers. Imported data is a geographic reference only: no navigation, traffic or routing. Not included in the normal TravelIt backup.</div><div class="form-grid"><div class="field full"><label for="map-pack-file">GeoJSON file (maximum 6 MiB)</label><input id="map-pack-file" type="file" accept=".geojson,.json,application/geo+json,application/json" required></div>${field('mapName','Region/map title','','text','required maxlength="120"')}${field('mapLicense','Data license / permission','','text','required maxlength="120"')}${field('mapAttribution','Required map attribution','','text','required maxlength="280"')}${field('mapSource','Source URL (optional)','','url')}</div><p class="subtext">Example licensing: © OpenStreetMap contributors, ODbL, for an authorized OSM-derived extract; confirm your data supplier permits offline use. Limit ${MAP_LIMITS.features.toLocaleString()} features and ${MAP_LIMITS.vertices.toLocaleString()} coordinate vertices.</p>`,async(_f,form)=>{
  const file=form.querySelector('#map-pack-file').files?.[0];if(!file)throw Error('Choose a .geojson file.');
  if(file.size>MAP_LIMITS.fileBytes)throw Error('GeoJSON exceeds the 6 MiB mobile safety limit. Import a smaller region.');
  let data;try{data=JSON.parse(await file.text());}catch{throw Error('The selected file is not valid GeoJSON JSON.');}
  const pack=inspectFeatureCollection(data,{name:form.querySelector('#f-mapName').value,license:form.querySelector('#f-mapLicense').value,attribution:form.querySelector('#f-mapAttribution').value,sourceUrl:form.querySelector('#f-mapSource').value});
  pack.id=crypto.randomUUID();pack.importedAt=new Date().toISOString();pack.contentSha256=await sha256MapPack(pack);
  const estimate=await navigator.storage?.estimate?.();if(estimate?.quota!==undefined&&estimate?.usage!==undefined){const remaining=estimate.quota-estimate.usage;if(remaining<file.size*2)throw Error('Insufficient browser storage headroom. Free storage and retry.');}
  await putMapPack(state.db,pack,{expectedMapRevision:modalBaseMapRevision,activate:pack.id,rejectExisting:true});await finishMapChange();state.mapDraft=null;state.mapFixedBounds=null;state.view='map';render();toast(`Offline geographic map imported: ${pack.featureCount} features; backup original GeoJSON separately.`);
 },'Import onto this device');
}
function importOsmStreets(){
 openModal('Import offline OpenStreetMap streets',`<div class="alert blue" style="margin-bottom:14px"><strong>Street-reference map, no subscription.</strong> First open <a href="https://www.openstreetmap.org/export" target="_blank" rel="noopener noreferrer">OpenStreetMap Export</a>, zoom in, select a <b>small neighborhood</b> and choose <b>Download XML Data</b>. Then select the .osm file here. The roads and street names will be displayed offline. <strong>This is not navigation</strong>: no routing, traffic, road-access validation, or travel-time estimates. Map data: © OpenStreetMap contributors, ODbL 1.0.</div><div class="form-grid"><div class="field full"><label for="osm-street-file">OSM XML export (max 6 MiB)</label><input id="osm-street-file" type="file" accept=".osm,.xml,text/xml,application/xml" required></div>${field('osmRegionName','Region name','My local street reference','text','required maxlength="120"')}</div><p class="subtext">An XML export can include many nodes. If the import fails or is slow, select a smaller area. Street lines are drawn from the file locally without connecting to a mapping server.</p>`,async(_f,form)=>{
  const file=form.querySelector('#osm-street-file').files?.[0];if(!file)throw Error('Choose an OSM XML file.');
  if(file.size>OSM_IMPORT_LIMITS.fileBytes)throw Error('OSM XML export exceeds 6 MiB. Select a smaller area.');
  const {pack,stats}=inspectOsmStreetPack(await file.text(),{name:form.querySelector('#f-osmRegionName').value});
  pack.id=crypto.randomUUID();pack.importedAt=new Date().toISOString();pack.contentSha256=await sha256MapPack(pack);
  const estimate=await navigator.storage?.estimate?.();const bytes=new TextEncoder().encode(JSON.stringify(pack)).byteLength;
  if(estimate?.quota!==undefined&&estimate?.usage!==undefined&&estimate.quota-estimate.usage<bytes*2)throw Error('Insufficient local browser storage. Save external backups and free space first.');
  await putMapPack(state.db,pack,{expectedMapRevision:modalBaseMapRevision,activate:pack.id,rejectExisting:true});await finishMapChange();state.mapFixedBounds=null;state.mapDraft=null;state.view='map';render();
  toast(`${stats.roads} roads/paths saved in an offline reference map; NOT road navigation.`);
 },'Import street reference locally');
}
function downloadTextFile(content,filename){
 const blob=new Blob([content],{type:'text/plain;charset=utf-8'});
 const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;
 document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
async function shareBrief(which,copy=false){
 let trip, date=null, scope='trip';
 if(which==='today'){
  const t=pickTodayTrip(state.trips,new Date(),state.selectedTrip);
  if(!t)throw Error('No upcoming or active trip to share.');
  trip=t;date=t.onTrip?t.localDate:t.startDate;scope='day';
 }else{
  trip=selected();if(!trip)throw Error('Select a trip first.');
  if(which==='day'){date=state.chosenDay>=trip.startDate&&state.chosenDay<=trip.endDate?state.chosenDay:trip.startDate;scope='day';}
 }
 const brief=makeTripBrief({trip,date,scope,stops:state.stops,places:state.places,packing:state.packing,expenses:state.expenses,vehicle:state.vehicles.find(v=>v.id===trip.vehicleId)||null});
 if(copy){
  if(!navigator.clipboard?.writeText)throw Error('Clipboard is unavailable. Use Download day instead.');
  await navigator.clipboard.writeText(brief.text);
  toast('Day plan copied. Review before sharing; it contains saved place names and Waze links.');
 }else{
  downloadTextFile(brief.text,brief.filename);
  toast('Plain-text trip brief downloaded. It is not a backup or LiveIt sync.');
 }
}
function downloadJSONFile(value,filename){
 const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
async function installCatalogMap(){
 const region=FREE_MAP_CATALOG[0];
 if(state.mapDownloadBusy)throw Error('A map download is already in progress.');
 if(!confirm(`Download ${region.label} from geoBoundaries? This is province/region boundary reference data, NOT streets or navigation. Requires internet once. No subscription or login.`))return;
 state.mapDownloadBusy=true;const mapRevisionAtStart=state.mapRevision;
 try{
  const {pack}=await fetchCatalogRegion(region);
  pack.id=crypto.randomUUID();pack.importedAt=new Date().toISOString();pack.contentSha256=await sha256MapPack(pack);
  const estimate=await navigator.storage?.estimate?.();const estimatedBytes=new TextEncoder().encode(JSON.stringify(pack)).byteLength;
  if(estimate?.quota!==undefined&&estimate?.usage!==undefined&&estimate.quota-estimate.usage<estimatedBytes*2)throw Error('Insufficient local storage for this map. No map installed.');
  await putMapPack(state.db,pack,{expectedMapRevision:mapRevisionAtStart,activate:pack.id,rejectExisting:true});
  await finishMapChange();state.mapFixedBounds=null;state.mapDraft=null;state.view='map';render();toast(`Installed ${pack.featureCount} geographic boundaries locally. Download a portable map backup before relying on this device.`);
 }catch(error){toast(catalogFailureHelp(error),true);}
 finally{state.mapDownloadBusy=false;}
}
async function exportPortableMap(){
 const pack=activePack();if(!pack)throw Error('Select an imported map first.');
 const portable=await portableMapExport(pack);
 const safeName=pack.name.replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'').slice(0,55)||'region';
 downloadJSONFile(portable,`TravelIt_Map_${safeName}.travelitmap.json`);
 toast('Portable geographic map backup exported. This is separate from trip backup.');
}
function importPortableMap(){
 openModal('Restore an offline map pack',`<div class="alert blue" style="margin-bottom:12px">Import an exported <b>TravelIt portable map</b>. Checksums and geographic limits are verified before installation. Your existing map packs will not be overwritten. You may restore the same region more than once; duplicate copies are not recommended.</div><div class="field"><label for="portable-map-file">Map backup file (.travelitmap.json)</label><input id="portable-map-file" type="file" accept=".json,application/json" required></div>`,async(_f,form)=>{
  const file=form.querySelector('#portable-map-file').files?.[0];if(!file)throw Error('Choose a portable map file.');
  if(file.size>MAP_LIMITS.fileBytes*2)throw Error('Portable file exceeds the mobile safety size limit.');
  let payload;try{payload=JSON.parse(await file.text());}catch{throw Error('Invalid portable map JSON.');}
  const pack=await portableMapImport(payload);
  if(state.mapPacks.some(p=>p.contentSha256===pack.contentSha256))throw Error('This map already exists. No duplicate was added.');
  pack.id=crypto.randomUUID();pack.importedAt=new Date().toISOString();
  await putMapPack(state.db,pack,{expectedMapRevision:modalBaseMapRevision,activate:pack.id,rejectExisting:true});
  await finishMapChange();state.mapFixedBounds=null;state.view='map';render();toast('Map backup verified and restored locally.');
 },'Verify and restore');
}
function currentMapBounds(){
 const pack=activePack(),pinned=state.places.filter(p=>p.lat!==null&&p.lng!==null&&(!pack||p.lat>=pack.bounds.minLat&&p.lat<=pack.bounds.maxLat&&p.lng>=pack.bounds.minLng&&p.lng<=pack.bounds.maxLng));
 const all=[...pinned,...state.annotations.flatMap(a=>a.points),...(state.mapDraft?.points||[])];
 if(pack)all.push({lat:pack.bounds.minLat,lng:pack.bounds.minLng},{lat:pack.bounds.maxLat,lng:pack.bounds.maxLng});
 return (pack?.regionAtlas||pack?.dataProfile==='osm-street-reference-v1')?streetReferenceBounds(pack.bounds):mapBounds(all);
}
async function handler(target){const actionName=target.dataset.action;if(!actionName)return;try{
  if(actionName==='today-open-prepare'){const t=pickTodayTrip(state.trips,new Date(),state.selectedTrip);if(!t)throw Error('No planned trip to review.');state.selectedTrip=t.id;state.tripTab='prepare';setNav('trips');return;}
  if(actionName.startsWith('prep-jump:')){const destination=actionName.slice('prep-jump:'.length);if(destination==='places'){setNav('explore');return;}if(destination==='offline'){setNav('more');return;}if(['packing','itinerary','budget'].includes(destination)){state.tripTab=destination==='budget'?'costs':destination;setNav('trips');return;}throw Error('Unknown preparation action.');}
  if(actionName==='brief-trip'){await shareBrief('trip');return;}if(actionName==='brief-day'){await shareBrief('day');return;}if(actionName==='brief-copy-day'){await shareBrief('day',true);return;}if(actionName==='brief-copy-today'){await shareBrief('today',true);return;}if(actionName==='brief-download-today'){await shareBrief('today');return;}if(actionName==='run-local-diagnostic'){try{const result=await storageReadbackProbe(state.db);state.storageHealth={ok:true,message:result.ok?'Temporary IndexedDB write/readback verified on this device.':'Diagnostic incomplete.'};}catch(e){state.storageHealth={ok:false,message:'Local storage diagnostic failed: '+(e.message||String(e))};}try{state.localAudit=auditWorkspace(await allData(state.db));}catch(e){state.localAudit={recordCount:0,commandCount:0,issues:[{code:'AUDIT_FAILURE',entity:'workspace',detail:e.message||String(e)}],errors:1,warnings:0};}render();toast(state.storageHealth.ok?'Local integrity check completed.':'Local storage check failed. Export any recoverable backup.',!state.storageHealth.ok);return;}if(actionName==='add-vehicle')vehicleEditor();else if(actionName.startsWith('edit-vehicle:'))vehicleEditor(state.vehicles.find(v=>v.id===actionName.slice('edit-vehicle:'.length)));else if(actionName.startsWith('delete-vehicle:')){const id=actionName.slice('delete-vehicle:'.length);if(state.trips.some(t=>t.vehicleId===id))throw Error('This vehicle is assigned to a trip. Change the trip vehicle before removal.');if(confirm('Remove this vehicle profile?'))await erase('vehicle',id);}else if(actionName==='packing-mindmap')packingMindmapEditor();else if(actionName==='add-expense')expenseEditor();else if(actionName.startsWith('edit-expense:'))expenseEditor(state.expenses.find(e=>e.id===actionName.slice('edit-expense:'.length)));else if(actionName.startsWith('delete-expense:')){const id=actionName.slice('delete-expense:'.length);if(confirm('Remove this local trip expense?'))await erase('expense',id);}else if(actionName==='import-map-pack')importMapPack();else if(actionName==='import-osm-streets')importOsmStreets();else if(actionName==='import-region-atlas')importRegionAtlas();else if(actionName==='create-region-atlas')createRegionalAtlas();else if(actionName==='verify-region-atlas')await auditSelectedAtlas();else if(actionName==='export-region-atlas')await exportSelectedAtlas();else if(actionName==='download-ph-boundaries')await installCatalogMap();else if(actionName==='export-portable-map'){if(activePack()?.regionAtlas)throw Error('Preserve the original regional atlas JSON file; portable export currently supports only small maps.');await exportPortableMap();}else if(actionName==='import-portable-map')importPortableMap();else if(actionName.startsWith('jump-map-place:')){const p=placeById(actionName.slice('jump-map-place:'.length));if(!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lng))throw Error('Saved destination is not pinned.');const lat=p.lat,lng=p.lng;state.mapFixedBounds={minLat:Math.max(-90,lat-.05),maxLat:Math.min(90,lat+.05),minLng:Math.max(-180,lng-.07),maxLng:Math.min(180,lng+.07)};render();}else if(actionName==='map-fit'){state.mapFixedBounds=null;render();}else if(actionName.startsWith('map-viewport:')){state.mapFixedBounds=moveViewport(state.mapFixedBounds||currentMapBounds(),actionName.slice('map-viewport:'.length));render();}else if(actionName.startsWith('activate-map:')){await setActiveMapPack(state.db,actionName.slice(13),{expectedMapRevision:state.mapRevision});workspaceChannel?.announce('map-selection');state.atlasRequest++;state.atlasView=null;state.atlasLoading=null;state.atlasAudit=null;await refresh();state.mapFixedBounds=null;render();}else if(actionName==='delete-map-pack'){const pack=activePack();if(pack&&confirm(`Remove locally imported map “${pack.name}”? Pins and annotations will remain.`)){const nextActiveId=state.mapPacks.find(p=>p.id!==pack.id)?.id||null;if(pack.regionAtlas)await deleteAtlasRegion(state.db,pack,{expectedMapRevision:state.mapRevision,nextActiveId});else await deleteMapPack(state.db,pack.id,{expectedMapRevision:state.mapRevision,nextActiveId});state.atlasRequest++;state.atlasView=null;state.atlasLoading=null;state.atlasAudit=null;await finishMapChange();state.mapFixedBounds=null;render();}}else if(actionName==='add-place')placeEditor();
else if(actionName.startsWith('plan-place:'))planSavedPlace(actionName.slice(11));
else if(actionName==='add-itinerary-row'){const b=$('#itinerary-grid-body');if(b){b.insertAdjacentHTML('beforeend',itineraryInputRow());b.lastElementChild?.querySelector('[data-day-field=title]')?.focus();}}else if(actionName==='save-itinerary-grid'){await saveItineraryGrid();}else if(actionName==='day-prev'){const t=selected();if(t){state.chosenDay=nextTripDay(state.chosenDay,t,-1);render();}}
else if(actionName==='day-next'){const t=selected();if(t){state.chosenDay=nextTripDay(state.chosenDay,t,1);render();}}
else if(actionName.startsWith('select-day:')){state.chosenDay=actionName.slice(11);render();}
else if(actionName.startsWith('calendar-day:')){state.chosenDay=actionName.slice(13);render();}
else if(actionName.startsWith('calendar-month:')){state.calendarMonth=actionName.slice(15);render();}
else if(actionName==='calendar-open-day'){state.tripTab='itinerary';render();}
else if(actionName.startsWith('move-flex-up:')||actionName.startsWith('move-flex-down:')){const up=actionName.startsWith('move-flex-up:');const id=actionName.slice(up?13:15);const changed=reorderFlexibleStops(state.stops,state.selectedTrip,id,up?-1:1);if(changed.length){await writeLocally(()=>guardedSaveRecords(state.db,'stop',changed,{expectedEpoch:state.workspaceEpoch,expectedRevisionByKey:Object.fromEntries(changed.map(item=>[`stop:${item.id}`,state.recordRevisions[`stop:${item.id}`]??0])),expectedPresenceByKey:Object.fromEntries(changed.map(item=>[`stop:${item.id}`,Boolean(state.recordPresence[`stop:${item.id}`])]))}));toast('Flexible activity order saved locally.');}}else if(actionName==='new-trip')tripEditor();else if(actionName==='edit-trip')tripEditor(selected());else if(actionName==='add-stop')stopEditor();else if(actionName==='add-packing')packingEditor();else if(actionName==='open-trips'){state.tripTab='packing';setNav('trips');}else if(actionName==='assign-trip-vehicle')tripVehicleEditor();else if(actionName==='packing-add-row'){const body=$('#packing-draft-body');if(body){body.insertAdjacentHTML('beforeend',packingDraftRow());body.lastElementChild?.querySelector('input[data-packing-field=label]')?.focus();}}else if(actionName==='packing-save-rows'){await savePackingBatch();}else if(actionName==='packing-template')packingTemplateEditor();else if(actionName==='show-map'){state.mapDraft=null;state.mapFixedBounds=null;state.view='map';render();}else if(actionName.startsWith('start-map:')){const kind=actionName.slice(10);state.mapDraft={kind,points:[]};state.mapFixedBounds=(activePack()?.regionAtlas||activePack()?.dataProfile==='osm-street-reference-v1')?streetReferenceBounds(activePack().bounds):mapBounds([...state.places.filter(p=>p.lat!==null),...state.annotations.flatMap(a=>a.points),...(activePack()?.bounds?[{lat:activePack().bounds.minLat,lng:activePack().bounds.minLng},{lat:activePack().bounds.maxLat,lng:activePack().bounds.maxLng}]:[])]);state.view='map';render();}else if(actionName==='cancel-map'){state.mapDraft=null;state.mapFixedBounds=null;render();}else if(actionName==='undo-map'){state.mapDraft?.points.pop();render();}else if(actionName==='finish-map'){if(!state.mapDraft)return;const min=state.mapDraft.kind==='pin'?1:state.mapDraft.kind==='line'?2:3;if(state.mapDraft.points.length<min)throw Error(`Add at least ${min} point(s) before saving.`);annotationEditor();}else if(actionName.startsWith('remove-annotation:')){const id=actionName.slice(18);if(confirm('Remove this local map annotation?'))await erase('annotation',id);}else if(actionName==='verify-offline-shell'){await checkOfflineShell(true);}else if(actionName==='request-persistence'){if(!navigator.storage?.persist)throw Error('Persistent storage is not supported here.');const granted=await navigator.storage.persist();await checkStorage();toast(granted?'Browser granted persistent storage. Keep external backups.':'Persistent storage was not granted. Keep external backups.',!granted);}else if(actionName==='go-explore')setNav('explore');else if(actionName==='today-open-trip'){const t=pickTodayTrip(state.trips,new Date(),state.selectedTrip);state.selectedTrip=t?.id||state.selectedTrip;if(t)state.chosenDay=t.onTrip?t.localDate:t.startDate;state.tripTab='itinerary';setNav('trips');}else if(actionName==='export-backup')await exportBackup();else if(actionName==='import-backup')importBackup();else if(actionName==='undo-restore'){if(!state.recovery)throw Error('No restore recovery is available.');if(!confirm('Swap this workspace with the previous pre-restore snapshot? You can undo this swap if necessary.'))return;const outcome=await undoRestore(state.db,{expectedWorkspaceRevision:state.workspaceRevision});workspaceChannel?.announce('undo-restore');state.selectedTrip=null;state.mapDraft=null;await refresh();render();toast(`Recovered ${outcome.records} local record(s).`);}else if(actionName.startsWith('place:'))placeDetails(actionName.slice(6));else if(actionName.startsWith('annotation:')){const a=state.annotations.find(x=>x.id===actionName.slice(11));if(a)openModal(a.label,`<div class="stack"><p>${esc(a.notes||'No additional notes.')}</p><p class="subtext">${esc(a.kind)} · ${a.points.length} geographic point(s). Not calculated navigation.</p><div class="action-line">${action('Close','close-annotation')}</div></div>`);}else if(actionName==='close-annotation')closeModal();else if(actionName.startsWith('choose-trip:')){state.selectedTrip=actionName.slice(12);state.chosenDay='';state.calendarMonth='';state.tripTab='itinerary';render();}else if(actionName.startsWith('edit-stop:'))stopEditor(state.stops.find(x=>x.id===actionName.slice(10)));else if(actionName.startsWith('delete-stop:')){const id=actionName.slice(12);if(confirm('Remove this itinerary activity?'))await erase('stop',id);}else if(actionName.startsWith('edit-pack:'))packingEditor(state.packing.find(x=>x.id===actionName.slice(10)));else if(actionName.startsWith('delete-pack:')){const id=actionName.slice(12);if(confirm('Remove this packing item?'))await erase('packing',id);}
}catch(err){toast(err.message||'Action failed',true);}}
async function init(){try{state.db=await openDatabase(warnVersionChange);await refresh();workspaceChannel=createWorkspaceCoordinator({onChange:()=>scheduleExternalRefresh()});window.addEventListener('focus',scheduleExternalRefresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleExternalRefresh();});const v=new URL(location.href).searchParams.get('view');if(['explore','map','trips','today','photos','more'].includes(v))state.view=v;else if(v==='packing'){state.view='trips';state.tripTab='packing';}render();$('#side-nav').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b)setNav(b.dataset.view);});$('#mobile-nav').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b)setNav(b.dataset.view);});$('#quick-save').addEventListener('click',()=>placeEditor());$('#today-shortcut').addEventListener('click',()=>setNav('today'));$('#modal-close').addEventListener('click',()=>closeModal());$('#modal-backdrop').addEventListener('click',e=>{if(e.target.id==='modal-backdrop')closeModal();});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#modal-backdrop').classList.contains('hidden'))closeModal();});$('#main').addEventListener('click',e=>{const target=e.target.closest('[data-action]');if(target)handler(target);else if(state.mapDraft&&e.target.closest('#geo-canvas')){const svg=e.target.closest('#geo-canvas');const p=mapClickToGeo(svg,e);if(!p)return;if(state.mapDraft.kind==='pin')state.mapDraft.points=[p];else if(state.mapDraft.points.length<200)state.mapDraft.points.push(p);render();}});$('#main').addEventListener('change',async e=>{if(e.target.id==='category-filter'){state.category=e.target.value;render();}else if(e.target.id==='trip-day'){state.chosenDay=e.target.value;render();}else if(e.target.dataset.packId){await handlePackingChange(e.target);}});$('#main').addEventListener('input',e=>{if(e.target.id==='explore-search'){const cursor=e.target.selectionStart;state.search=e.target.value;render();const inp=$('#explore-search');inp.focus();inp.setSelectionRange(cursor,cursor);}});$('#main').addEventListener('click',e=>{const b=e.target.closest('[data-trip-tab]');if(b){state.tripTab=b.dataset.tripTab;render();return;}const f=e.target.closest('[data-stage-filter]');if(f){state.stageFilter=f.dataset.stageFilter;render();}});window.addEventListener('online',colorStatus);window.addEventListener('offline',colorStatus);checkStorage();void checkOfflineShell();navigator.serviceWorker?.addEventListener('controllerchange',()=>{void checkOfflineShell();});state.shellCached=false;
    const params=new URLSearchParams(location.search),sourceText=params.get('text')||'',sourceUrl=params.get('url')||(sourceText.match(/https?:\/\/\S+/)?.[0]||'');if(sourceUrl||params.get('title')){placeEditor(null,{url:sourceUrl,title:params.get('title')||'',notes:sourceText.replace(sourceUrl,'').trim()});}
    if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js').then(reg=>checkOfflineShell().catch(()=>{})).catch(()=>toast('Offline shell could not be installed; local records still work.',true));}
  }catch(err){$('#main').innerHTML=`<div class="alert red"><strong>TravelIt could not open local storage.</strong><p>${esc(err.message)}</p><p>Do not clear browser data before recovering any existing content.</p></div>`;console.error(err);}}
init();
