/** Licensed no-account catalog — this endpoint supplies administrative boundaries,
 * NOT roads. User explicitly starts each download; no bulk OSM tile prefetching.
 */
import {MAP_LIMITS,inspectFeatureCollection} from './offline-map-pack.js';
export const FREE_MAP_CATALOG=Object.freeze([
 {id:'phl-adm1',label:'Philippines — administrative regions (historical boundary reference)',endpoint:'https://www.geoboundaries.org/api/current/gbOpen/PHL/ADM1/',license:'CC BY 4.0 (catalog fallback)',attribution:'geoBoundaries — www.geoboundaries.org',capability:'BOUNDARIES_ONLY'}
]);
const ALLOWED_HOSTS=new Set(['www.geoboundaries.org','geoboundaries.org','geoboundaries-dev.org','www.geoboundaries-dev.org','github.com','raw.githubusercontent.com','media.githubusercontent.com']);
export function allowableCatalogUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&ALLOWED_HOSTS.has(u.hostname.toLowerCase())&&!u.username&&!u.password;}catch{return false;}}
export function catalogGeoJSONUrl(meta){
 if(!meta||typeof meta!=='object'||Array.isArray(meta))throw Error('Map provider metadata is missing.');
 const candidate=meta.simplifiedGeometryGeoJSON||meta.gjDownloadURL;
 if(!allowableCatalogUrl(candidate))throw Error('Map provider returned an unapproved download host.');
 return candidate;
}
async function boundedResponse(response,maxBytes){
 if(!response?.ok)throw Error(`Map download failed (HTTP ${response?.status??'unknown'}).`);
 const contentLength=Number(response.headers?.get('content-length'));
 if(Number.isFinite(contentLength)&&contentLength>maxBytes)throw Error('Source map is larger than this mobile viewer permits; use a smaller extract.');
 const chunks=[];let n=0;
 if(response.body?.getReader){const reader=response.body.getReader();try{for(;;){const {value,done}=await reader.read();if(done)break;n+=value.byteLength;if(n>maxBytes){await reader.cancel();throw Error('Source map exceeds the mobile size limit; no map was installed.');}chunks.push(value);}}finally{reader.releaseLock();}}
 else {const a=new Uint8Array(await response.arrayBuffer());n=a.byteLength;if(n>maxBytes)throw Error('Source map exceeds the mobile size limit; no map was installed.');chunks.push(a);}
 const bytes=new Uint8Array(n);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw Error('Map source did not return valid UTF-8 GeoJSON.');}
}
export async function fetchCatalogRegion(entry,{fetcher=fetch,signal}={}){
 if(!FREE_MAP_CATALOG.some(p=>p.id===entry?.id&&p.endpoint===entry?.endpoint))throw Error('Unknown map catalog entry.');
 if(!allowableCatalogUrl(entry.endpoint))throw Error('Unapproved map catalog endpoint.');
 const meta=await boundedResponse(await fetcher(entry.endpoint,{signal,cache:'no-store'}),64*1024);
 const link=catalogGeoJSONUrl(meta);
 const raw=await boundedResponse(await fetcher(link,{signal,cache:'no-store'}),MAP_LIMITS.fileBytes);
 const year=String(meta.boundaryYearRepresented||'').slice(0,12);
 const source=String(meta.boundarySource||'').replace(/[\x00-\x1f]/g,' ').trim().slice(0,130);
 const license=String(meta.boundaryLicense||entry.license).replace(/[\x00-\x1f]/g,' ').trim().slice(0,120);
 const attribution=[entry.attribution,source].filter(Boolean).join(' · ').slice(0,280);
 const title=year?`${entry.label} (${year} source boundaries)`:entry.label;
 const pack=inspectFeatureCollection(raw,{name:title.slice(0,120),attribution,license,sourceUrl:entry.endpoint});
 return {pack,downloadUrl:link,capability:entry.capability};
}
/** Does not promise source availability or CORS; user can use manual import instead. */
export function catalogFailureHelp(error){const message=String(error?.message||error||'Unknown map download error');return `${message} Try downloading the GeoJSON from geoBoundaries and use Import GeoJSON. Browser cross-origin restrictions and source limits vary.`;}
