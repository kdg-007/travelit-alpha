/** Offline OpenStreetMap XML import for small, manually exported areas.
 * No network requests or subscription; never attempts routing or navigation.
 * Input is untrusted. The resulting street reference is NOT a routable network.
 * Map data remains subject to the Open Database License (ODbL) and attribution.
 */
import {MAP_LIMITS,inspectFeatureCollection} from './offline-map-pack.js';
export const OSM_IMPORT_LIMITS=Object.freeze({fileBytes:MAP_LIMITS.fileBytes,nodes:50000,ways:6500,refs:100000,features:MAP_LIMITS.features,vertices:MAP_LIMITS.vertices});
export const OSM_ATTRIBUTION='© OpenStreetMap contributors';
export const OSM_LICENSE='ODbL 1.0';
export const OSM_SOURCE='https://www.openstreetmap.org/export';
const ROAD_MAJOR=new Set(['motorway','trunk','primary','secondary','motorway_link','trunk_link','primary_link','secondary_link']);
const ROAD_SECONDARY=new Set(['tertiary','tertiary_link','residential','unclassified','living_street']);
const ROAD_PATH=new Set(['footway','pedestrian','path','cycleway','steps','bridleway']);
const ROAD_EXCLUDE=new Set(['proposed','construction','planned','abandoned','razed']);
const trim=(s,n)=>String(s??'').replace(/[\x00-\x1f]/g,' ').trim().slice(0,n);
const numericId=s=>/^\d{1,19}$/.test(String(s||''));
export function streetKind(tags){
 const h=tags?.highway;
 if(h){if(ROAD_EXCLUDE.has(h))return null;if(ROAD_MAJOR.has(h))return 'road-major';if(ROAD_SECONDARY.has(h))return 'road-secondary';if(ROAD_PATH.has(h))return 'road-path';return 'road-local';}
 if(tags?.waterway)return 'water';
 if(tags?.natural==='water'||tags?.landuse==='reservoir')return 'water';
 if(['forest','grass','meadow','recreation_ground','village_green'].includes(tags?.landuse)||['park','garden'].includes(tags?.leisure))return 'park';
 if(tags?.building&&tags.building!=='no')return 'building';
 return null;
}
/** Pure converter; data shape matches parsed OSM node and way records. */
export function osmRecordsToGeoJSON({nodes,ways}){
 if(!(nodes instanceof Map)||!Array.isArray(ways))throw Error('Invalid OpenStreetMap records.');
 if(nodes.size>OSM_IMPORT_LIMITS.nodes||ways.length>OSM_IMPORT_LIMITS.ways)throw Error('Area too large for a phone. Export a smaller neighborhood.');
 const features=[];let vertices=0,roads=0,paths=0,skipped=0;
 for(const way of ways){
  const kind=streetKind(way.tags);if(!kind)continue;
  if(!Array.isArray(way.refs)||way.refs.length>OSM_IMPORT_LIMITS.refs)throw Error('Map way contains excessive node references.');
  const coords=way.refs.map(id=>nodes.get(String(id))).filter(Boolean);
  if(coords.length<2||coords.length!==way.refs.length){skipped++;continue;}
  if(kind==='building'||kind==='park'||kind==='water'){
   if(coords.length<4||coords[0][0]!==coords.at(-1)[0]||coords[0][1]!==coords.at(-1)[1]){
    if(kind!=='water'){skipped++;continue;}
   }
  }
  vertices+=coords.length;
  if(vertices>OSM_IMPORT_LIMITS.vertices||features.length>=OSM_IMPORT_LIMITS.features)throw Error('Street extract exceeds mobile map limits; choose a smaller area.');
  const isPolygon=['building','park'].includes(kind)||(kind==='water'&&coords.length>=4&&coords[0][0]===coords.at(-1)[0]&&coords[0][1]===coords.at(-1)[1]);
  features.push({type:'Feature',geometry:isPolygon?{type:'Polygon',coordinates:[coords]}:{type:'LineString',coordinates:coords},properties:{kind,name:trim(way.tags?.name||way.tags?.ref||'',70)}});
  if(kind.startsWith('road')){roads++;if(kind==='road-path')paths++;}
 }
 if(!roads)throw Error('No roads or paths were found in this extract. Export a smaller area containing streets.');
 return {geojson:{type:'FeatureCollection',features},stats:{roads,paths,features:features.length,vertices,skipped}};
}
/** DOMParser is the browser's built-in XML parser; it runs locally, no fetch. */
export function parseOsmXml(text,{parser}={}){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>OSM_IMPORT_LIMITS.fileBytes)throw Error('OSM XML file exceeds the 6 MiB mobile size limit.');
 if(/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(text))throw Error('OSM XML declarations with DTD, entities or stylesheets are not allowed.');
 const preamble=text.trimStart().replace(/^<\?xml[^>]*\?>\s*/i,'').replace(/^(?:<!--[^]*?-->\s*)*/,'');
 if(!/^<osm(?:\s|>)/i.test(preamble))throw Error('Expected an OpenStreetMap .osm XML export.');
 const XML=parser||(typeof DOMParser!=='undefined'?new DOMParser():null);
 if(!XML)throw Error('XML parser is unavailable on this device.');
 const doc=XML.parseFromString(text,'application/xml');
 if(doc.getElementsByTagName('parsererror').length||doc.documentElement?.tagName!=='osm')throw Error('Malformed OpenStreetMap XML.');
 const get=tag=>Array.from(doc.documentElement.getElementsByTagName(tag));
 const rawNodes=get('node'),rawWays=get('way');
 if(rawNodes.length>OSM_IMPORT_LIMITS.nodes||rawWays.length>OSM_IMPORT_LIMITS.ways)throw Error('Too much geographic data. Select a smaller area in OpenStreetMap Export.');
 const nodes=new Map();
 for(const node of rawNodes){const id=node.getAttribute('id'),rawLat=node.getAttribute('lat'),rawLng=node.getAttribute('lon'),lat=Number(rawLat),lng=Number(rawLng);
  if(!numericId(id)||rawLat===null||rawLng===null||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)throw Error('OSM node contains invalid geographic coordinates or ID.');
  if(nodes.has(id))throw Error('Duplicate OSM node ID.');nodes.set(id,[lng,lat]);
 }
 let refs=0;const ways=[];
 for(const way of rawWays){const id=way.getAttribute('id');if(!numericId(id))throw Error('Invalid OSM way ID.');
  const tags=Object.create(null),links=[];
  for(const child of way.children){
   if(child.tagName==='nd'){
    const ref=child.getAttribute('ref');if(!numericId(ref))throw Error('Invalid OSM node reference.');links.push(ref);if(++refs>OSM_IMPORT_LIMITS.refs)throw Error('Too many OSM way references.');
   }else if(child.tagName==='tag'){
    const key=child.getAttribute('k');if(['highway','natural','waterway','landuse','leisure','building','name','ref'].includes(key))tags[key]=trim(child.getAttribute('v'),180);
   }
  }
  ways.push({id,refs:links,tags});
 }
 return osmRecordsToGeoJSON({nodes,ways});
}
/** Only auto-fill OSM credit when the file has actually passed strict OSM XML parsing. */
export function inspectOsmStreetPack(text,{name='OpenStreetMap local street reference',parser}={}){
 const {geojson,stats}=parseOsmXml(text,{parser});
 const pack=inspectFeatureCollection(geojson,{name,license:OSM_LICENSE,attribution:OSM_ATTRIBUTION,sourceUrl:OSM_SOURCE});
 pack.dataProfile='osm-street-reference-v1';
 return {pack,stats};
}
