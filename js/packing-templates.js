/** TravelIt packing templates. Local defaults only; no remote service. */
import {normalizePacking} from './domain.js';
export const PACKING_TEMPLATES=Object.freeze({
  'Family road trip':[
    ['Essentials','Driver’s license',1],['Essentials','Vehicle registration and insurance copies',1],['Electronics','Phone chargers',2],['Electronics','Power bank',1],['Family','Drinking water',1],['Family','Travel snacks',1],['Personal care','First-aid kit',1],['Clothing','Change of clothes',1]
  ],
  'Beach vacation':[
    ['Clothing','Swimwear',1],['Clothing','Beach towels',2],['Personal care','Sunscreen',1],['Personal care','After-sun lotion',1],['Family','Swim goggles',1],['Family','Waterproof bag',1],['Electronics','Waterproof phone pouch',1],['Essentials','Hotel reservation reference',1]
  ],
  'International flight':[
    ['Essentials','Original passport',1],['Essentials','Visa or entry permit if required',1],['Essentials','Flight booking reference',1],['Essentials','Travel insurance details',1],['Electronics','Travel adapters',1],['Essentials','Accommodation confirmation',1],['Clothing','Carry-on change of clothes',1],['Personal care','Travel-size toiletries',1]
  ],
  'Hiking day trip':[
    ['Essentials','Route plan and emergency contact',1],['Family','Water and trail snacks',1],['Clothing','Weather layer',1],['Personal care','First-aid kit',1],['Essentials','Headlamp',1],['Essentials','Offline navigation prepared',1]
  ],
  'Diving trip':[
    ['Essentials','Certification and operator information',1],['Personal care','Reef-safe sun protection',1],['Clothing','Swimwear',1],['Essentials','Operator and emergency contact',1],['Family','Dry bag',1],['Electronics','Waterproof camera',1]
  ]
});
export const labelKey = v=>String(v||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('en');
/** Build only not-yet-listed items for a trip. Never reset packed statuses or generate duplicate IDs on retries. */
export function prepareTemplateImport(templateName,trip,current=[],now='2026-10-30T00:00:00.000Z',idFactory){
  if(!Object.hasOwn(PACKING_TEMPLATES,templateName))throw Error('Unknown packing template.');
  if(!trip?.id)throw Error('Select a trip before applying a template.');
  if(typeof idFactory!=='function')throw Error('ID generator is required.');
  const seen=new Set(current.filter(x=>x.tripId===trip.id).map(x=>labelKey(x.label)));
  const prepared=[];
  for(const [category,label,quantity] of PACKING_TEMPLATES[templateName]){
    const k=labelKey(label);if(seen.has(k))continue;seen.add(k);
    prepared.push(normalizePacking({id:idFactory(),label,category,quantity,owner:'',packed:false},trip,now));
  }
  return {items:prepared,skipped:PACKING_TEMPLATES[templateName].length-prepared.length};
}
