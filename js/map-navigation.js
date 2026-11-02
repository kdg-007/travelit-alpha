/** Coordinate viewport controls. No claim that geometric zoom provides routing. */
export function normalizedViewport(bounds){
 if(!bounds||!['minLat','maxLat','minLng','maxLng'].every(k=>Number.isFinite(bounds[k]))||bounds.minLat>=bounds.maxLat||bounds.minLng>=bounds.maxLng)throw Error('Invalid map viewport.');
 return {...bounds};
}
export function moveViewport(bounds,kind){
 const b=normalizedViewport(bounds),width=b.maxLng-b.minLng,height=b.maxLat-b.minLat;
 let centerLng=(b.minLng+b.maxLng)/2,centerLat=(b.minLat+b.maxLat)/2;
 let scale=1;
 switch(kind){case 'zoom-in':scale=.65;break;case 'zoom-out':scale=1/.65;break;case 'pan-left':centerLng-=width*.22;break;case 'pan-right':centerLng+=width*.22;break;case 'pan-up':centerLat+=height*.22;break;case 'pan-down':centerLat-=height*.22;break;default:throw Error('Unknown map viewport action.');}
 let w=Math.min(360,width*scale),h=Math.min(180,height*scale);
 centerLng=Math.min(180-w/2,Math.max(-180+w/2,centerLng));centerLat=Math.min(90-h/2,Math.max(-90+h/2,centerLat));
 return {minLng:centerLng-w/2,maxLng:centerLng+w/2,minLat:centerLat-h/2,maxLat:centerLat+h/2};
}

/** Tight fit for neighborhood-sized OSM street data. The generic place plot
 * intentionally pads by 0.3 degrees, far too wide for a 0.02-degree street
 * extract; keep the street geometry legible without altering coordinates. */
export function streetReferenceBounds(bounds){
 if(!bounds||!['minLat','maxLat','minLng','maxLng'].every(k=>Number.isFinite(bounds[k]))||bounds.minLat>bounds.maxLat||bounds.minLng>bounds.maxLng)throw Error('Invalid street reference bounds.');
 const width=Math.max(bounds.maxLng-bounds.minLng,0.002),height=Math.max(bounds.maxLat-bounds.minLat,0.002);
 const centerLng=(bounds.minLng+bounds.maxLng)/2,centerLat=(bounds.minLat+bounds.maxLat)/2;
 const hw=Math.max(width*0.58,0.0015),hh=Math.max(height*0.58,0.0015);
 return {minLng:Math.max(-180,centerLng-hw),maxLng:Math.min(180,centerLng+hw),minLat:Math.max(-90,centerLat-hh),maxLat:Math.min(90,centerLat+hh)};
}
