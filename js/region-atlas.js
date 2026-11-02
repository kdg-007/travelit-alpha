/** Bounded, local-only, geographic-cell road reference atlas.
 * Source data and licenses are supplied by user/developer; this is NOT
 * navigation, routing, geocoding or a replacement for an offline map SDK.
 */
export const ATLAS_LIMITS=Object.freeze({bytes:25*1024*1024,tiles:600,features:100000,vertices:220000,visibleTiles:55,visibleFeatures:18000});
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const text=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.length<=max&&!/[\u0000-\u001f]/.test(s);
export function validBounds(b){return !!b&&['minLng','maxLng','minLat','maxLat'].every(k=>finite(b[k]))&&b.minLng>=-180&&b.maxLng<=180&&b.minLat>=-90&&b.maxLat<=90&&b.minLng<b.maxLng&&b.minLat<b.maxLat;}
export function intersects(a,b){return a.minLng<=b.maxLng&&a.maxLng>=b.minLng&&a.minLat<=b.maxLat&&a.maxLat>=b.minLat;}
const inside=(p,b)=>Array.isArray(p)&&p.length===2&&finite(p[0])&&finite(p[1])&&p[0]>=b.minLng-1e-6&&p[0]<=b.maxLng+1e-6&&p[1]>=b.minLat-1e-6&&p[1]<=b.maxLat+1e-6;
function validateFeature(f,b){
 if(!f||!['road-major','road-secondary','road-local','road-path','water'].includes(f.kind)||typeof f.label!=='string'||f.label.length>70||/[\u0000-\u001f]/.test(f.label)||!Array.isArray(f.groups)||f.groups.length!==1)throw Error('Invalid atlas reference-road feature.');
 const group=f.groups[0];if(group.closed!==false||!Array.isArray(group.coords)||group.coords.length!==2||!group.coords.every(p=>inside(p,b))||JSON.stringify(group.coords[0])===JSON.stringify(group.coords[1]))throw Error('Atlas reference segments must have exactly two valid geographic endpoints.');
}
export function validateAtlasPayload(payload){
 if(!payload||payload.format!=='travelit-region-atlas-1'||!Array.isArray(payload.tiles)||payload.tiles.length===0||payload.tiles.length>ATLAS_LIMITS.tiles)throw Error('Unsupported, empty or oversized TravelIt regional atlas.');
 if(!text(payload.name,120)||!text(payload.license,120)||!text(payload.attribution,280)||!validBounds(payload.bounds)||payload.dataProfile!=='osm-street-reference-v1')throw Error('Atlas must have a name, attribution, license, geographic bounds and recognized street-reference profile.');
 if(payload.sourceUrl&&(!/^https:\/\/[^\s]+$/.test(payload.sourceUrl)||payload.sourceUrl.length>1000))throw Error('Atlas source URL must be HTTPS.');
 if(!finite(payload.gridDegrees)||payload.gridDegrees<0.02||payload.gridDegrees>1)throw Error('Invalid atlas grid size.');
 const seen=new Set();let features=0,vertices=0;
 for(const tile of payload.tiles){
  if(!tile||typeof tile.id!=='string'||!/^[0-9]+:[0-9]+$/.test(tile.id)||seen.has(tile.id)||!validBounds(tile.bounds)||!intersects(payload.bounds,tile.bounds)||!Array.isArray(tile.features))throw Error('Missing, duplicate or invalid atlas tile.');
  seen.add(tile.id);
  const [x,y]=tile.id.split(':').map(Number);const expectedLng=x*payload.gridDegrees-180,expectedLat=y*payload.gridDegrees-90;
  if(Math.abs(tile.bounds.minLng-expectedLng)>1e-5||Math.abs(tile.bounds.minLat-expectedLat)>1e-5||Math.abs(tile.bounds.maxLng-expectedLng-payload.gridDegrees)>1e-5||Math.abs(tile.bounds.maxLat-expectedLat-payload.gridDegrees)>1e-5)throw Error('Atlas tile identity does not match geographic grid bounds.');
  if(tile.features.length>30000)throw Error('Atlas tile is too complex for mobile storage.');
  for(const f of tile.features){validateFeature(f,tile.bounds);features++;vertices+=2;if(features>ATLAS_LIMITS.features||vertices>ATLAS_LIMITS.vertices)throw Error('Atlas exceeds mobile complexity limit.');}
 }
 if(payload.tileCount!==payload.tiles.length||payload.featureCount!==features)throw Error('Atlas manifest counts do not match actual tiles.');
 return {featureCount:features,tileCount:seen.size,vertexCount:vertices};
}
export async function digestBytes(value){const bytes=new TextEncoder().encode(value);const out=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(out),b=>b.toString(16).padStart(2,'0')).join('');}
function manifestDigestInput(m){return {name:m.name,attribution:m.attribution,license:m.license,sourceUrl:m.sourceUrl,dataProfile:m.dataProfile,bounds:m.bounds,gridDegrees:m.gridDegrees,tileCount:m.tileCount,featureCount:m.featureCount,tiles:m.tiles};}
export async function prepareRegionAtlas(payload,{id}={}){
 const counts=validateAtlasPayload(payload);
 const regionId=id||(crypto.randomUUID?.()||'local-'+Date.now());
 const tiles=[];for(const tile of payload.tiles){
  const hash=await digestBytes(JSON.stringify(tile.features));
  tiles.push({key:`${regionId}:${tile.id}`,regionId,tileId:tile.id,bounds:tile.bounds,hash,features:tile.features});
 }
 const manifest={id:regionId,name:payload.name,attribution:payload.attribution,license:payload.license,sourceUrl:payload.sourceUrl||'',dataProfile:'osm-street-reference-v1',regionAtlas:true,bounds:payload.bounds,gridDegrees:payload.gridDegrees,featureCount:counts.featureCount,tileCount:counts.tileCount,tiles:tiles.map(t=>({tileId:t.tileId,bounds:t.bounds,hash:t.hash,featureCount:t.features.length})),importedAt:new Date().toISOString()};
 manifest.contentSha256=await digestBytes(JSON.stringify(manifestDigestInput(manifest)));
 return {manifest,tiles};
}
export function visibleTileDescriptors(manifest,bounds,{limit=ATLAS_LIMITS.visibleTiles}={}){
 if(!validBounds(bounds)||!manifest?.regionAtlas||!Array.isArray(manifest.tiles))throw Error('Invalid atlas or viewport.');
 const visible=manifest.tiles.filter(t=>intersects(t.bounds,bounds));
 if(visible.length>limit)return {tiles:[],tooMany:true,count:visible.length};
 return {tiles:visible,tooMany:false,count:visible.length};
}
export async function verifyAtlasTile(tile,descriptor){
 return !!tile&&!!descriptor&&tile.tileId===descriptor.tileId&&JSON.stringify(tile.bounds)===JSON.stringify(descriptor.bounds)&&await digestBytes(JSON.stringify(tile.features))===descriptor.hash;
}
export async function verifyRegionManifest(manifest){
 if(!manifest||!manifest.regionAtlas||!Array.isArray(manifest.tiles)||!text(manifest.contentSha256,64))return false;
 const hash=await digestBytes(JSON.stringify(manifestDigestInput(manifest)));
 return manifest.contentSha256===hash;
}

/** V14 metadata preflight: old V13 manifests remain readable and return null.
 * A null count means the UI must inspect actual verified tile contents.
 */
export function estimateVisibleFeatureCount(descriptors){
 if(!Array.isArray(descriptors))throw Error('Invalid viewport tile descriptors.');
 if(descriptors.some(t=>!Number.isSafeInteger(t.featureCount)||t.featureCount<0))return null;
 return descriptors.reduce((n,t)=>n+t.featureCount,0);
}
