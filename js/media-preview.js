/** Public media-link presentation only. External video pages are NEVER scraped.
 * Remote YouTube preview images may fail or be unavailable offline; keep a
 * graphical fallback. User-selected JPEG cover copies remain authoritative.
 */
const VIDEO_HOSTS=new Map([
 ['facebook.com','Facebook'],['fb.watch','Facebook'],['instagram.com','Instagram'],
 ['tiktok.com','TikTok'],['vimeo.com','Vimeo']
]);
const within=(host,root)=>host===root||host.endsWith('.'+root);
export function mediaLinkInfo(input){
 let url;
 try{url=new URL(String(input||''));}catch{return {kind:'none',label:'',remoteThumbnail:null};}
 if(!['https:','http:'].includes(url.protocol))return {kind:'none',label:'',remoteThumbnail:null};
 const host=url.hostname.toLowerCase().replace(/\.$/,'');
 const youtube=within(host,'youtube.com')||host==='youtu.be'||within(host,'youtube-nocookie.com');
 if(youtube){
  const segments=url.pathname.split('/').filter(Boolean),id=host==='youtu.be'?segments[0]:
   segments[0]==='watch'?url.searchParams.get('v'):
   ['shorts','live','embed'].includes(segments[0])?segments[1]:null;
  const valid=/^[A-Za-z0-9_-]{11}$/.test(id||'');
  return {kind:'video',label:'YouTube',remoteThumbnail:valid?'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg':null};
 }
 for(const [domain,label] of VIDEO_HOSTS){
  if(within(host,domain)){
   const isVideo=domain==='facebook.com'? /\/(?:reel|watch|videos|share\/(?:v|r))\b/i.test(url.pathname)||url.searchParams.has('v'):
    domain==='instagram.com'?/^\/(?:reel|reels|p)\//.test(url.pathname):
    domain==='tiktok.com'?/\/video\//.test(url.pathname):
    domain==='vimeo.com'?/^\/\d+(?:\/|$)/.test(url.pathname):false;
   return {kind:isVideo?'video':'link',label,remoteThumbnail:null};
  }
 }
 return {kind:'link',label:'Saved link',remoteThumbnail:null};
}
export function suggestedMediaTitle(sourceUrl){
 const media=mediaLinkInfo(sourceUrl);
 return media.kind==='video'?media.label+' video':media.kind==='link'?media.label==='Saved link'?'Saved place':media.label+' link':'';
}
