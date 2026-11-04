/** TravelIt compact photo stories, not an archival photo library.
 * The compressed JPEG itself lives in the existing records store and verified
 * backup. Original resolution, EXIF and file provenance are not retained.
 */
const PHOTO_DATA=/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;
const clean=(s,max)=>String(s??'').trim().slice(0,max);
export function normalizePhoto(input,now=new Date().toISOString()){
 const id=String(input.id||globalThis.crypto?.randomUUID?.()||'photo_'+Date.now());
 if(!/^[a-zA-Z0-9_-]{3,120}$/.test(id))throw Error('Invalid photo identifier.');
 const image=String(input.image||'');
 if(!PHOTO_DATA.test(image)||image.length>190000)throw Error('Please choose a supported, compressed photo.');
 const title=clean(input.title,150)||'Untitled photo';
 const caption=clean(input.caption,1000);
 const placeId=clean(input.placeId,120)||null;
 const tripId=clean(input.tripId,120)||null;
 const photoDate=clean(input.photoDate,10)||null;
 if(photoDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(photoDate)||
  new Date(photoDate+'T12:00:00Z').toISOString().slice(0,10)!==photoDate))
  throw Error('Photo date must be a valid calendar day.');
 const createdAt=String(input.createdAt||now);
 if(!Number.isFinite(Date.parse(createdAt)))throw Error('Invalid photo creation date.');
 return {id,image,title,caption,placeId,tripId,photoDate,
  origin:'travelit-local-photo',createdAt,updatedAt:now};
}
export function galleryItems(photos=[],places=[],filter='all',tripId=null){
 const cards=photos.map(p=>({...p,kind:'photo'}));
 const covers=places.filter(p=>p.coverImage).map(p=>({
  id:p.id,kind:'cover',image:p.coverImage,title:p.name,caption:p.notes||'',
  placeId:p.id,tripId:null,photoDate:null,createdAt:p.createdAt,updatedAt:p.updatedAt
 }));
 const list=[...cards,...covers];
 return list.filter(p=>filter==='all'||filter==='photos'&&p.kind==='photo'||
  filter==='places'&&p.kind==='cover'||filter==='trip'&&tripId&&p.tripId===tripId)
  .sort((a,b)=>String(b.photoDate||b.createdAt||'').localeCompare(String(a.photoDate||a.createdAt||''))||
  String(a.id).localeCompare(String(b.id)));
}
