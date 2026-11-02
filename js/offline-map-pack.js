/** TravelIt offline GeoJSON overlay format — standalone, no tile service or subscription.
 * Bounds and byte/feature limits guard the mobile renderer. Imported files remain local.
 * This module does NOT establish accuracy, navigation suitability or redistribution rights.
 */
export const MAP_LIMITS=Object.freeze({fileBytes:6*1024*1024,features:4000,vertices:40000,coordinateDepth:4});
const obj=o=>o&&typeof o==='object'&&!Array.isArray(o);
const isCoord=p=>Array.isArray(p)&&p.length>=2&&p.length<=4&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
const clean=(s,max)=>String(s??'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,max);
const bboxFromPoints=pts=>({minLng:Math.min(...pts.map(p=>p[0])),minLat:Math.min(...pts.map(p=>p[1])),maxLng:Math.max(...pts.map(p=>p[0])),maxLat:Math.max(...pts.map(p=>p[1]))});
export function isWithinPack(pack,point){if(!pack?.bounds||!point||!Number.isFinite(point.lat)||!Number.isFinite(point.lng))return false;const b=pack.bounds;return point.lat>=b.minLat&&point.lat<=b.maxLat&&point.lng>=b.minLng&&point.lng<=b.maxLng;}
export function inspectFeatureCollection(raw,{name='',attribution='',license='',sourceUrl=''}={}){
 if(!obj(raw)||raw.type!=='FeatureCollection'||!Array.isArray(raw.features))throw Error('Import a GeoJSON FeatureCollection. Other formats are not supported.');
 if(raw.features.length===0||raw.features.length>MAP_LIMITS.features)throw Error('Map file must contain 1–4000 features.');
 const out=[];let vertices=0;const pts=[];
 const line=arr=>{if(!Array.isArray(arr)||arr.length<2)throw Error('A line or ring has too few coordinates.');const path=arr.map(p=>{if(!isCoord(p))throw Error('Invalid longitude/latitude in map data.');vertices++;if(vertices>MAP_LIMITS.vertices)throw Error('Too many vertices for an offline mobile map.');const coord=[Number(p[0]),Number(p[1])];pts.push(coord);return coord;});return path;};
 for(const f of raw.features){if(!obj(f)||f.type!=='Feature'||!obj(f.geometry))throw Error('Invalid map feature.');const g=f.geometry,groups=[];
 if(g.type==='LineString')groups.push({closed:false,coords:line(g.coordinates)});
 else if(g.type==='MultiLineString'){if(!Array.isArray(g.coordinates))throw Error('Invalid MultiLineString');for(const x of g.coordinates)groups.push({closed:false,coords:line(x)});}
 else if(g.type==='Polygon'){if(!Array.isArray(g.coordinates))throw Error('Invalid polygon');for(const x of g.coordinates)groups.push({closed:true,coords:line(x)});}
 else if(g.type==='MultiPolygon'){if(!Array.isArray(g.coordinates))throw Error('Invalid multipolygon');for(const p of g.coordinates){if(!Array.isArray(p))throw Error('Invalid multipolygon ring');for(const x of p)groups.push({closed:true,coords:line(x)});}}
 else if(g.type==='Point'){if(!isCoord(g.coordinates))throw Error('Invalid point');const p=[Number(g.coordinates[0]),Number(g.coordinates[1])];pts.push(p);vertices++;groups.push({point:p});}
 else if(g.type==='MultiPoint'){if(!Array.isArray(g.coordinates))throw Error('Invalid MultiPoint');for(const x of g.coordinates){if(!isCoord(x))throw Error('Invalid point');const p=[Number(x[0]),Number(x[1])];pts.push(p);vertices++;groups.push({point:p});}}
 else throw Error('Unsupported geometry: '+String(g.type));
 if(vertices>MAP_LIMITS.vertices||groups.length>MAP_LIMITS.vertices)throw Error('Excessive map complexity.');
 const properties=obj(f.properties)?f.properties:{};
 // Only safe, small display fields survive ingestion. No untrusted HTML or scripts.
 const kind=clean(properties.highway? 'road':properties.waterway?'water':properties.natural==='water'?'water':properties.landuse==='forest'?'park':properties.kind||properties.class||'other',40).toLowerCase();
 out.push({kind,label:clean(properties.name||'',70),groups});
 }
 if(!pts.length)throw Error('No geographic coordinates found.');
 const bounds=bboxFromPoints(pts);
 if(bounds.maxLng-bounds.minLng>160||bounds.maxLat-bounds.minLat>90)throw Error('Region is too broad for the current geographic renderer. Import a smaller area.');
 if(!clean(name,120)||!clean(attribution,280)||!clean(license,120))throw Error('Provide map name, required attribution and license/source terms.');
 if(sourceUrl&&(!/^https:\/\//i.test(sourceUrl)||sourceUrl.length>1000))throw Error('Map source URL must be an HTTPS URL.');
 return {format:'travelit-geodata-1',name:clean(name,120),attribution:clean(attribution,280),license:clean(license,120),sourceUrl:clean(sourceUrl,1000),bounds,features:out,featureCount:out.length,vertexCount:vertices};
}
export async function sha256MapPack(pack){const s=JSON.stringify({...pack,contentSha256:undefined,id:undefined,importedAt:undefined,sourceFileSha256:undefined});const bytes=new TextEncoder().encode(s);const d=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(d),b=>b.toString(16).padStart(2,'0')).join('');}
export async function verifyMapPack(pack){if(!pack||!/^([a-f0-9]{64})$/.test(pack.contentSha256||''))return false;return (await sha256MapPack(pack))===pack.contentSha256;}
export function renderOfflineFeatures(pack,b){if(!pack||!Array.isArray(pack.features))return '';
 const project=c=>({x:35+630*(c[0]-b.minLng)/(b.maxLng-b.minLng),y:310-260*(c[1]-b.minLat)/(b.maxLat-b.minLat)});
 const className=k=>k==='road-major'?'offline-road-major':k==='road-secondary'?'offline-road-secondary':k==='road-path'?'offline-road-path':k==='road-local'||k==='road'?'offline-road':k==='water'?'offline-water':k==='park'?'offline-park':k==='building'?'offline-building':'offline-feature';
 return `<g class="offline-map-data" aria-hidden="true" clip-path="url(#offline-map-clip)">${pack.features.map(f=>f.groups.map(g=>{if(g.point){const p=project(g.point);return `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="2" class="offline-point"/>`;}
 const d=g.coords.map((c,i)=>{const p=project(c);return `${i?'L':'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`;}).join(' ')+(g.closed?' Z':'');return `<path d="${d}" class="${className(f.kind)}"/>`;}).join('')).join('')}</g>`;
}

/** Export a portable, independently verifiable map. Regular trip backup stays small. */
export async function portableMapExport(pack){
 if(!(await verifyMapPack(pack)))throw Error('Map content has changed; cannot export a corrupted pack.');
 const {id,importedAt,...content}=pack;
 return {format:'travelit-portable-map-1',exportedAt:new Date().toISOString(),content};
}
/** Recreate source geometries, then feed them through the same bounded GeoJSON importer.
 * No original MapPack object is trusted merely because it supplies its own digest.
 */
function reconstructGeoJSON(content){
 if(!content||!Array.isArray(content.features))throw Error('Invalid portable map.');
 return {type:'FeatureCollection',features:content.features.map(f=>{
  if(!f||!Array.isArray(f.groups)||!f.groups.length||f.groups.length>MAP_LIMITS.vertices)throw Error('Invalid portable map groups.');
  let geometry;
  if(f.groups.every(g=>Array.isArray(g.point))){geometry=f.groups.length===1?{type:'Point',coordinates:f.groups[0].point}:{type:'MultiPoint',coordinates:f.groups.map(g=>g.point)};}
  else if(f.groups.every(g=>g.closed===true&&Array.isArray(g.coords))){geometry={type:'Polygon',coordinates:f.groups.map(g=>g.coords)};}
  else if(f.groups.every(g=>g.closed===false&&Array.isArray(g.coords))){geometry=f.groups.length===1?{type:'LineString',coordinates:f.groups[0].coords}:{type:'MultiLineString',coordinates:f.groups.map(g=>g.coords)};}
  else throw Error('Invalid or mixed portable map geometry.');
  return {type:'Feature',properties:{kind:f.kind,name:f.label},geometry};
 })};
}
export async function portableMapImport(payload){
 if(!payload||payload.format!=='travelit-portable-map-1'||!payload.content||!/^[a-f0-9]{64}$/.test(payload.content.contentSha256||''))throw Error('Not a valid TravelIt portable map.');
 const content=payload.content;
 if(content.features.length>MAP_LIMITS.features)throw Error('Portable map has too many features.');
 const repacked=inspectFeatureCollection(reconstructGeoJSON(content),{name:content.name,attribution:content.attribution,license:content.license,sourceUrl:content.sourceUrl});
 if(content.dataProfile!==undefined){if(content.dataProfile!=='osm-street-reference-v1')throw Error('Unrecognized portable map data profile.');repacked.dataProfile=content.dataProfile;}
 const digest=await sha256MapPack(repacked);
 if(digest!==content.contentSha256)throw Error('Portable map checksum mismatch. No data was imported.');
 return {...repacked,contentSha256:digest};
}

/** Collision-limited, HTML-safe labels for *imported* street reference data only.
 * We never render arbitrary GeoJSON labels as raw SVG/HTML or pretend these
 * street names imply routability, legal access, or current road conditions.
 */
export function renderOfflineStreetLabels(pack,b,{limit=22}={}){
 if(pack?.dataProfile!=='osm-street-reference-v1'||!Array.isArray(pack.features)||!b)return '';
 const labels=[],seen=new Set(),boxes=[];
 const escapeXml=t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 for(const f of pack.features){
  if(labels.length>=limit)break;
  const name=String(f.label||'').trim();
  if(!name||!String(f.kind).startsWith('road')||seen.has(name.toLocaleLowerCase()))continue;
  const line=f.groups.find(g=>Array.isArray(g.coords)&&g.coords.length>=2);
  if(!line)continue;
  const p=line.coords[Math.floor(line.coords.length/2)];
  if(p[0]<b.minLng||p[0]>b.maxLng||p[1]<b.minLat||p[1]>b.maxLat)continue;
  const x=35+630*(p[0]-b.minLng)/(b.maxLng-b.minLng),y=310-260*(p[1]-b.minLat)/(b.maxLat-b.minLat);
  const w=Math.min(130,Math.max(28,name.length*6.1));const box={x:x-w/2,y:y-10,w,h:15};
  if(box.x<37||box.x+box.w>662||box.y<56||box.y+box.h>306)continue;
  if(boxes.some(q=>box.x<q.x+q.w&&box.x+box.w>q.x&&box.y<q.y+q.h&&box.y+box.h>q.y))continue;
  seen.add(name.toLocaleLowerCase());boxes.push(box);
  labels.push(`<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="middle" class="offline-street-name">${escapeXml(name)}</text>`);
 }
 return `<g class="offline-street-labels" aria-hidden="true" clip-path="url(#offline-map-clip)">${labels.join('')}</g>`;
}
