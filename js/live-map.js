/* TravelIt interactive online map.
 * MapLibre/OSM-derived OpenFreeMap: no Google billing, no API key.
 * This code never prefetches tiles or claims offline road navigation.
 */
const MAPLIBRE_URL = 'https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.mjs';
const MAPLIBRE_CSS = 'https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.css';
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
let live = null;
let sequence = 0;
let pickMode = false;

export function validPin(place) {
 const lat=Number(place?.lat),lng=Number(place?.lng);
 return place?.lat!==null&&place?.lat!==undefined&&place?.lng!==null&&place?.lng!==undefined
  &&Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180;
}
export function placedMarkers(places=[],stops=[],selectedTripId=null) {
 const ordered=stops.filter(x=>x.tripId===selectedTripId&&x.placeId).slice()
  .sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))
    ||String(a.time||'').localeCompare(String(b.time||''))
    ||Number(a.sortOrder||0)-Number(b.sortOrder||0));
 const order=new Map();
 ordered.forEach((s,i)=>{if(!order.has(s.placeId))order.set(s.placeId,i+1);});
 return places.filter(validPin).map(p=>({
  id:String(p.id),name:String(p.name||'Saved place'),
  lat:Number(p.lat),lng:Number(p.lng),category:String(p.category||'Place'),
  tripOrder:order.get(p.id)||null
 }));
}
export function boundsForMarkers(markers=[]) {
 if(!markers.length)return null;
 return markers.reduce((b,p)=>({
  minLat:Math.min(b.minLat,p.lat),maxLat:Math.max(b.maxLat,p.lat),
  minLng:Math.min(b.minLng,p.lng),maxLng:Math.max(b.maxLng,p.lng)
 }),{minLat:90,maxLat:-90,minLng:180,maxLng:-180});
}
function cssOnce(){
 if(document.querySelector('link[data-travelit-maplibre]'))return;
 const link=document.createElement('link');
 link.rel='stylesheet';link.href=MAPLIBRE_CSS;link.dataset.travelitMaplibre='yes';
 document.head.appendChild(link);
}
function statusText(text){
 const n=document.getElementById('live-map-status');
 if(n)n.textContent=text;
}
function wipe(){
 if(live){try{live.remove();}catch{}live=null;}
 pickMode=false;
}
export function destroyLiveMap(){
 sequence++;wipe();
}
export function setLiveMapPinMode(enabled=true){
 if(!live)return false;
 pickMode=Boolean(enabled);
 statusText(pickMode?'Tap the map to save a pin.':'');
 return true;
}
export function focusLiveMap(id){
 const item=live?.__travelitMarkers?.find(p=>p.id===id);
 if(!item||!live)return false;
 live.flyTo({center:[item.lng,item.lat],zoom:Math.max(12,live.getZoom()),essential:true});
 return true;
}
export function fitLiveMap(){
 const pins=live?.__travelitMarkers||[];
 if(!live)return false;
 if(!pins.length){live.flyTo({center:[122,12.8],zoom:5,essential:true});return true;}
 const b=boundsForMarkers(pins);
 if(b.minLat===b.maxLat&&b.minLng===b.maxLng)live.flyTo({center:[b.minLng,b.minLat],zoom:12,essential:true});
 else live.fitBounds([[b.minLng,b.minLat],[b.maxLng,b.maxLat]],{padding:Math.min(80,Math.max(36,Math.round(innerWidth*.1))),maxZoom:13,duration:500});
 return true;
}
function fallback(el,pins){
 if(!el)return;
 const b=boundsForMarkers(pins);
 const base=b?[(b.minLng-.25),(b.minLat-.18),(b.maxLng+.25),(b.maxLat+.18)]:[118,9,126,17];
 const url='https://www.openstreetmap.org/export/embed.html?bbox='+base.map(x=>x.toFixed(5)).join('%2C')+'&layer=mapnik';
 el.replaceChildren();
 const frame=document.createElement('iframe');
 frame.src=url;frame.title='Online OpenStreetMap fallback';frame.loading='lazy';
 frame.referrerPolicy='strict-origin-when-cross-origin';frame.setAttribute('aria-label','Online map');
 frame.style.cssText='border:0;width:100%;height:100%;display:block';
 el.appendChild(frame);
 statusText('Simple online map · saved pins are listed below');
}
export async function mountLiveMap({container,places=[],stops=[],selectedTripId=null,onPlaceClick,onPinPick}={}){
 const token=++sequence;
 wipe();
 if(!container)return;
 const markers=placedMarkers(places,stops,selectedTripId);
 container.replaceChildren();
 statusText('Loading map…');
 try{
  cssOnce();
  // The dependency is loaded only while viewing Maps, never at app startup.
  const gl=await import(MAPLIBRE_URL);
  if(token!==sequence||!container.isConnected)return;
  const first=markers.find(p=>p.tripOrder)||markers[0];
  const instance=new gl.Map({
   container,style:STYLE_URL,
   center:first?[first.lng,first.lat]:[122,12.8],zoom:first?10:5,
   attributionControl:true,dragRotate:false,pitchWithRotate:false
  });
  live=instance;
  instance.__travelitMarkers=markers;
  instance.addControl(new gl.NavigationControl({showCompass:false}),'top-right');
  instance.on('load',()=>{
   if(token===sequence){fitLiveMap();statusText(markers.length?markers.length+' saved places on map':'Tap Pin here to save your first location');}
  });
  instance.on('click',event=>{
   if(!pickMode)return;
   pickMode=false;
   statusText('');
   const {lat,lng}=event.lngLat;
   if(Number.isFinite(lat)&&Number.isFinite(lng))onPinPick?.({lat,lng});
  });
  for(const p of markers){
   const node=document.createElement('button');
   node.type='button';
   node.className='travelit-map-pin';
   node.textContent=p.tripOrder?String(p.tripOrder):'•';
   node.setAttribute('aria-label',p.name);
   node.title=p.name;
   node.addEventListener('click',event=>{event.stopPropagation();onPlaceClick?.(p.id);});
   new gl.Marker({element:node,anchor:'bottom'})
    .setLngLat([p.lng,p.lat])
    .addTo(instance);
  }
 }catch(error){
  if(token!==sequence||!container.isConnected)return;
  fallback(container,markers);
 }
}
