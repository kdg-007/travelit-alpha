import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mediaLinkInfo,suggestedMediaTitle} from '../js/media-preview.js';
import {normalizePlace} from '../js/domain.js';
test('YouTube watch, short and shared URLs resolve the public preview without any API key',()=>{
 const id='dQw4w9WgXcQ',target='https://i.ytimg.com/vi/'+id+'/hqdefault.jpg';
 for(const link of ['https://youtube.com/watch?v='+id,'https://www.youtube.com/shorts/'+id,
  'https://youtu.be/'+id+'?feature=shared','https://m.youtube.com/live/'+id]){
  const p=mediaLinkInfo(link);
  assert.deepEqual(p,{kind:'video',label:'YouTube',remoteThumbnail:target});
 }
 assert.equal(suggestedMediaTitle('https://youtu.be/'+id),'YouTube video');
});
test('Facebook, Instagram and TikTok are clearly labeled without inventing thumbnails',()=>{
 for(const link of ['https://facebook.com/reel/xyz123','https://www.facebook.com/watch/?v=1010',
  'https://www.instagram.com/reel/ABC123/','https://www.tiktok.com/@creator/video/12345']){
  const media=mediaLinkInfo(link);
  assert.equal(media.kind,'video');
  assert.equal(media.remoteThumbnail,null);
 }
 assert.equal(mediaLinkInfo('https://www.instagram.com/p/ABcD/').kind,'video');
});
test('do not trust spoofed domains, other URL schemes or invalid video IDs',()=>{
 const bad=['https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
  'javascript:alert(1)','data:text/html,hi'];
 for(const url of bad)assert.equal(mediaLinkInfo(url).remoteThumbnail,null);
 assert.equal(mediaLinkInfo('https://www.youtube.com/watch?v=wrong').remoteThumbnail,null);
 assert.equal(mediaLinkInfo('https://www.youtube.com/watch?v=wrong').kind,'video');
 assert.equal(mediaLinkInfo('https://example.com/destination').kind,'link');
});
test('record stores only user-chosen JPEG screenshot and source URL, never an unstable remote preview',()=>{
 const p=normalizePlace({name:'Reel idea',sourceUrl:'https://www.facebook.com/reel/ABC',coverImage:'data:image/jpeg;base64,'+'A'.repeat(120)});
 assert.equal(p.sourceUrl,'https://www.facebook.com/reel/ABC');
 assert.match(p.coverImage,/^data:image\/jpeg;base64,/);
 assert.equal('remoteThumbnail' in p,false);
});
test('consumer source exposes quick in-card cover picker, fallback and editable source links',()=>{
 const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../css/style.css',import.meta.url),'utf8');
 assert.match(app,/function quickCoverPicker/);
 assert.match(app,/data-place-cover-id/);
 assert.match(app,/function wireMediaFallbacks/);
 assert.match(app,/function saveQuickPlaceCover/);
 assert.match(app,/suggestedMediaTitle/);
 assert.match(css,/story-cover-upload/);
 assert.match(css,/media-preview-unavailable/);
});
