/** TravelIt Batch 18: bounded local atlas creation + installed-pack verification/export.
 * Road reference ONLY. This neither downloads OpenStreetMap tiles nor computes navigation.
 * Data provenance/permission is supplied by the importer. No map-service dependency.
 */
import {ATLAS_LIMITS,validateAtlasPayload,verifyRegionManifest,verifyAtlasTile} from './region-atlas.js';

export const SELF_SERVICE_LIMITS=Object.freeze({sourceBytes:6*1024*1024,sourceFeatures:50000,gridDegrees:0.1,chunkTiles:8});
const HIGHWAY=Object.freeze({motorway:'road-major',trunk:'road-major',primary:'road-major',secondary:'road-secondary',tertiary:'road-secondary',residential:'road-local',unclassified:'road-local',living_street:'road-local',service:'road-local',track:'road-path',footway:'road-path',path:'road-path',cycleway:'road-path',pedestrian:'road-path',steps:'road-path'});
const TYPES=new Set(['road-major','road-secondary','road-local','road-path','water']);
function point(p){return Array.isArray(p)&&p.length>=2&&typeof p[0]==='number'&&typeof p[1]==='number'&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90?[p[0],p[1]]:null;}
function clipSegment(a,b,bounds){
 const [x0,y0]=a,[x1,y1]=b,dx=x1-x0,dy=y1-y0,p=[-dx,dx,-dy,dy],q=[x0-bounds.minLng,bounds.maxLng-x0,y0-bounds.minLat,bounds.maxLat-y0];let first=0,last=1;
 for(let i=0;i<4;i++){
  if(Math.abs(p[i])<1e-14){if(q[i]<0)return null;continue;}
  const ratio=q[i]/p[i];if(p[i]<0)first=Math.max(first,ratio);else last=Math.min(last,ratio);
  if(first>last)return null;
 }
 const at=t=>[Math.round((x0+t*dx)*1e7)/1e7,Math.round((y0+t*dy)*1e7)/1e7];const start=at(first),end=at(last);
 return start[0]===end[0]&&start[1]===end[1]?null:[start,end];
}
function cellIndex(lng,lat,step){return [Math.floor((lng+180)/step),Math.floor((lat+90)/step)];}
function boundsForCell(x,y,step){const minLng=Math.round((x*step-180)*1e7)/1e7,minLat=Math.round((y*step-90)*1e7)/1e7;return {minLng,maxLng:Math.round((minLng+step)*1e7)/1e7,minLat,maxLat:Math.round((minLat+step)*1e7)/1e7};}
function classifiedLines(f){
 if(f?.type!=='Feature'||!f.geometry||!f.properties||typeof f.properties!=='object')return [];
 const props=f.properties,highway=props.highway;
 if(highway&&(props.construction||['construction','proposed','planned','abandoned'].includes(highway)))return [];
 const kind=HIGHWAY[highway]||(props.waterway&&['river','stream','canal'].includes(props.waterway)?'water':null)||(TYPES.has(props.kind)?props.kind:null);
 if(!kind)return [];
 const g=f.geometry,raw=g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:[];
 if(!Array.isArray(raw))return [];
 const label=typeof props.name==='string'?props.name.replace(/[\x00-\x1f]/g,' ').slice(0,70):'';
 const lines=[];
 for(const coords of raw){if(!Array.isArray(coords)||coords.length<2)continue;const points=coords.map(point);for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i];if(!a||!b||(a[0]===b[0]&&a[1]===b[1])||Math.abs(a[0]-b[0])>180)continue;
  lines.push({kind,label,a,b});
 }}return lines;
}
/** Create validated TravelIt atlas from user-supplied bounded GeoJSON. Source is not fetched. */
export function buildAtlasFromRoadGeoJSON(data,{name,license,attribution,sourceUrl='',gridDegrees=SELF_SERVICE_LIMITS.gridDegrees}={}){
 if(!data||data.type!=='FeatureCollection'||!Array.isArray(data.features)||data.features.length>SELF_SERVICE_LIMITS.sourceFeatures)throw Error('Select a bounded GeoJSON FeatureCollection with at most 50,000 source features.');
 if(typeof name!=='string'||!name.trim()||typeof license!=='string'||!license.trim()||typeof attribution!=='string'||!attribution.trim())throw Error('Map title, license and required attribution must be supplied.');
 if(typeof gridDegrees!=='number'||!Number.isFinite(gridDegrees)||gridDegrees<0.02||gridDegrees>1)throw Error('Grid cell size must be between 0.02 and 1 degree.');
 const grid=new Map();let segmentCount=0;
 for(const source of data.features){for(const line of classifiedLines(source)){
  const {kind,label,a,b}=line;const [x0,y0]=cellIndex(Math.min(a[0],b[0]),Math.min(a[1],b[1]),gridDegrees),[x1,y1]=cellIndex(Math.max(a[0],b[0]),Math.max(a[1],b[1]),gridDegrees);
  if((x1-x0+1)*(y1-y0+1)>1000)throw Error('A road spans too many geographic cells; use a smaller extract.');
  for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){
   const bounds=boundsForCell(x,y,gridDegrees),piece=clipSegment(a,b,bounds);if(!piece)continue;
   const id=`${x}:${y}`;if(!grid.has(id)){if(grid.size>=ATLAS_LIMITS.tiles)throw Error('Region exceeds the atlas cell limit.');grid.set(id,{id,bounds,features:[]});}
   const tile=grid.get(id);if(tile.features.length>=30000)throw Error('A map cell contains too many segments. Choose a smaller region.');
   tile.features.push({kind,label,groups:[{closed:false,coords:piece}]});segmentCount++;
   if(segmentCount>ATLAS_LIMITS.features)throw Error('Region contains too many road segments. Choose a smaller extract.');
  }
 }}
 if(!grid.size)throw Error('No eligible existing roads, paths or waterways were found. Check the source fields.');
 const tiles=[...grid.values()].sort((a,b)=>a.id.localeCompare(b.id)),bounds={minLng:Math.min(...tiles.map(t=>t.bounds.minLng)),maxLng:Math.max(...tiles.map(t=>t.bounds.maxLng)),minLat:Math.min(...tiles.map(t=>t.bounds.minLat)),maxLat:Math.max(...tiles.map(t=>t.bounds.maxLat))};
 const atlas={format:'travelit-region-atlas-1',name:name.trim(),license:license.trim(),attribution:attribution.trim(),sourceUrl,dataProfile:'osm-street-reference-v1',gridDegrees,bounds,tileCount:tiles.length,featureCount:segmentCount,sourceFeatureCount:data.features.length,tiles};
 validateAtlasPayload(atlas);
 if(new TextEncoder().encode(JSON.stringify(atlas)).length>ATLAS_LIMITS.bytes)throw Error('Prepared atlas exceeds the 25 MiB mobile limit. Choose a smaller source.');
 return atlas;
}
/** All-cell integrity check and optional portable export, on-device, without mutating map data. */
export async function inspectInstalledAtlas(manifest,readTiles,{exportPayload=false,chunkSize=SELF_SERVICE_LIMITS.chunkTiles}={}){
 if(!(await verifyRegionManifest(manifest)))throw Error('Atlas manifest checksum does not match. Nothing was exported.');
 if(typeof readTiles!=='function'||!Number.isSafeInteger(chunkSize)||chunkSize<1||chunkSize>40)throw Error('Invalid atlas readback configuration.');
 let verified=0;const failures=[],out=[];
 for(let i=0;i<manifest.tiles.length;i+=chunkSize){
  const descriptors=manifest.tiles.slice(i,i+chunkSize),rows=await readTiles(descriptors);
  if(!Array.isArray(rows)||rows.length!==descriptors.length)throw Error('Map storage returned an incomplete cell response.');
  for(let j=0;j<descriptors.length;j++){
   const d=descriptors[j],tile=rows[j];
   if(!(await verifyAtlasTile(tile,d))){failures.push(d.tileId);continue;}
   verified++;
   if(exportPayload)out.push({id:d.tileId,bounds:d.bounds,features:tile.features});
  }
 }
 const status={ok:failures.length===0,verified,total:manifest.tiles.length,failed:failures.length,corruptedCells:failures.slice(0,30)};
 if(!exportPayload)return status;
 if(!status.ok)throw Error(`Atlas backup blocked: ${failures.length} map cell(s) are missing or damaged. No incomplete backup was exported.`);
 const atlas={format:'travelit-region-atlas-1',name:manifest.name,license:manifest.license,attribution:manifest.attribution,sourceUrl:manifest.sourceUrl||'',dataProfile:'osm-street-reference-v1',gridDegrees:manifest.gridDegrees,bounds:manifest.bounds,tileCount:manifest.tileCount,featureCount:manifest.featureCount,tiles:out};
 validateAtlasPayload(atlas);
 return {status,payload:atlas};
}
