/** Render bounded, locally verified atlas geometry as a small number of SVG paths.
 * ONLY for non-routable reference roads. Never implies navigation suitability.
 * SVG clipping reduces the path-data size; the viewBox clip protects edges.
 */
const KINDS=['road-major','road-secondary','road-local','road-path','water'];
const CLASS={ 'road-major':'offline-road-major','road-secondary':'offline-road-secondary','road-local':'offline-road','road-path':'offline-road-path','water':'offline-water'};
const px=n=>Number(n.toFixed(2));
const within=n=>Number.isFinite(n);
export function clipLineToBounds(a,c,b){
 if(!b||!Array.isArray(a)||!Array.isArray(c)||a.length!==2||c.length!==2||![...a,...c].every(within))return null;
 const dx=c[0]-a[0],dy=c[1]-a[1];let t0=0,t1=1;
 const p=[-dx,dx,-dy,dy],q=[a[0]-b.minLng,b.maxLng-a[0],a[1]-b.minLat,b.maxLat-a[1]];
 for(let i=0;i<4;i++){
  if(p[i]===0){if(q[i]<0)return null;continue;}
  const r=q[i]/p[i];if(p[i]<0)t0=Math.max(t0,r);else t1=Math.min(t1,r);
  if(t0>t1)return null;
 }
 const u=[a[0]+t0*dx,a[1]+t0*dy],v=[a[0]+t1*dx,a[1]+t1*dy];
 return u[0]===v[0]&&u[1]===v[1]?null:[u,v];
}
/** Feature cap guards JS work; SVG batches reduce DOM nodes. No unbounded string growth. */
export function renderAtlasRoads(features,viewport,{maxFeatures=18000,maxSvgBytes=1200000}={}){
 if(!viewport||!(viewport.maxLng>viewport.minLng)||!(viewport.maxLat>viewport.minLat))throw Error('Invalid map viewport.');
 if(!Array.isArray(features)||features.length>maxFeatures)throw Error('Map view is too detailed; zoom in.');
 const chunks=Object.fromEntries(KINDS.map(k=>[k,[]]));
 let considered=0,visible=0,subpixel=0,bytes=0;
 const project=pt=>[px(35+630*(pt[0]-viewport.minLng)/(viewport.maxLng-viewport.minLng)),px(310-260*(pt[1]-viewport.minLat)/(viewport.maxLat-viewport.minLat))];
 for(const f of features){
  if(!KINDS.includes(f.kind)||!Array.isArray(f.groups))continue;
  for(const g of f.groups){
   if(!Array.isArray(g.coords)||g.coords.length!==2)continue;
   considered++;
   const line=clipLineToBounds(g.coords[0],g.coords[1],viewport);
   if(!line)continue;
   const [a,b]=line.map(project);
   if(Math.hypot(b[0]-a[0],b[1]-a[1])<0.35){subpixel++;continue;}
   const fragment=`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`;
   bytes+=fragment.length+1;
   if(bytes>maxSvgBytes)throw Error('Map SVG size limit reached; zoom in.');
   chunks[f.kind].push(fragment);visible++;
  }
 }
 const markup=`<g class="offline-map-data atlas-batched-roads" aria-hidden="true" clip-path="url(#offline-map-clip)">${KINDS.filter(k=>chunks[k].length).map(k=>`<path class="${CLASS[k]}" d="${chunks[k].join(' ')}"/>`).join('')}</g>`;
 return {markup,stats:{considered,visible,subpixel,svgPaths:KINDS.filter(k=>chunks[k].length).length,svgBytes:markup.length}};
}
