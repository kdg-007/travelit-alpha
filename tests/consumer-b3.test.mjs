import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../css/style.css',import.meta.url),'utf8');
const between=(a,b)=>app.slice(app.indexOf(a),app.indexOf(b));
test('Explore removes inspirational hero and provides direct places, search, map, save',()=>{
 const s=between('function renderExplore(){','function activePack(){');
 assert.doesNotMatch(s,/Somewhere next|Every journey starts|Saved for another day|YOUR COLLECTION/);
 for(const token of ['Saved places','id="explore-search"','show-map','add-place','story-grid'])assert.ok(s.includes(token),token);
});
test('Photos has an actionable gallery and a concise empty state',()=>{
 const s=between('function renderPhotos(){','function renderMoreTechnical(){');
 assert.match(s,/No photos yet/);
 assert.match(s,/galleryItems/);
 assert.match(s,/photo-add/);
 assert.doesNotMatch(s,/automatically imported|automatically geolocated|offline tile cache/i);
});
test('My Library retains safe backup functions without disabled document card or redundant headings',()=>{
 const s=between('function renderMore(){','function render(){');
 assert.match(s,/Export/);assert.match(s,/Restore/);
 assert.match(s,/Not encrypted/);assert.match(s,/Advanced/);
 assert.doesNotMatch(s,/Travel documents|Secure document storage will become available|Your travel essentials/);
});
test('Main header actions shown only when relevant',()=>{
 const s=between('function render(){','function placeDetails(');
 assert.match(s,/\$\('#quick-save'\)\.hidden=state\.view!=='explore'/);
});
test('Mobile itinerary collapses to visible two-column card input groups without sticky overlaps',()=>{
 assert.match(css,/\.itinerary-table tbody tr\{display:grid;grid-template-columns:/);
 assert.match(css,/\.itinerary-table td:nth-child\(2\)\{grid-column:1\/-1;grid-row:1\}/);
 assert.match(css,/\.itinerary-table td:nth-child\(1\)::before\{content:'Time'\}/);
 assert.match(css,/\.itinerary-table td:nth-child\(2\)::before\{content:'Activity \/ stop'\}/);
 assert.match(css,/\.itinerary-table td,.itinerary-table td:first-child,.itinerary-table td:nth-child\(2\)\{position:static/);
});
test('Mobile layout uses original SIMA token palette and sans type',()=>{
 assert.match(css,/--navy:#133148/);assert.match(css,/--teal:#267e78/);
 assert.match(css,/\.journal-intro h2,.story-card h3,.journal-heading h2,.quiet-empty strong,.next-moment h3\{font-family:inherit/);
 assert.match(css,/\.top-actions \#today-shortcut\{display:none!important/);
});
