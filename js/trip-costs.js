/** TravelIt Batch 09: user-entered planning estimates, never online routing results. */
export const VEHICLE_TYPES=['Gasoline','Diesel','Hybrid','PHEV'];
export const EXPENSE_CATEGORIES=['Accommodation','Food','Activities','Parking','Other transport','Shopping','Other'];
const text=(v,max=160)=>String(v??'').trim().slice(0,max);
export function nonnegative(v,label,max=10000000,{nullable=false}={}){
  if(nullable&&(v===null||v===undefined||String(v).trim()===''))return null;
  if(typeof v==='boolean'||String(v??'').trim()===''||!Number.isFinite(Number(v))||Number(v)<0||Number(v)>max)throw Error(`${label} must be between 0 and ${max}.`);
  return Number(v);
}
/** Arithmetic for local budget cells, never JavaScript evaluation.
 * Supports +, -, *, /, parentheses and decimal numbers; no names/functions.
 */
export function parseBudgetEntry(input){
 if(input===null||input===undefined||String(input).trim()==='')return null;
 if(typeof input==='number'){if(!Number.isFinite(input))throw Error('Invalid amount.');return input;}
 const raw=String(input).trim();
 if(!raw.startsWith('=')){
  if(!/^\d+(?:\.\d*)?$|^\.\d+$/.test(raw))throw Error('Enter a number or a formula such as =3000*5.');
  return Number(raw);
 }
 const expression=raw.slice(1);
 if(!expression||expression.length>120)throw Error('Budget formula must contain 1–120 characters.');
 const tokens=[];const lexer=/\s*(\d+(?:\.\d*)?|\.\d+|[()+*/-])\s*/y;
 for(let i=0;i<expression.length;){
  lexer.lastIndex=i;const found=lexer.exec(expression);
  if(!found||found.index!==i)throw Error('Formula supports numbers and + - * / ( ) only.');
  tokens.push(found[1]);i=lexer.lastIndex;
  if(tokens.length>80)throw Error('Formula is too long.');
 }
 let pos=0,depth=0;
 const primary=()=>{
  if(++depth>25)throw Error('Too many nested parentheses.');
  let result;
  if(tokens[pos]==='+'||tokens[pos]==='-'){const sign=tokens[pos++];result=(sign==='-'?-1:1)*primary();}
  else if(tokens[pos]==='('){pos++;result=expr();if(tokens[pos++]!==')')throw Error('Missing closing parenthesis.');}
  else {const token=tokens[pos++];if(token===undefined||!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token))throw Error('Invalid formula number.');result=Number(token);}
  depth--;return result;
 };
 const term=()=>{let value=primary();while(tokens[pos]==='*'||tokens[pos]==='/'){const op=tokens[pos++],right=primary();if(op==='/'&&right===0)throw Error('Cannot divide by zero.');value=op==='*'?value*right:value/right;}return value;};
 const expr=()=>{let value=term();while(tokens[pos]==='+'||tokens[pos]==='-'){const op=tokens[pos++],right=term();value=op==='+'?value+right:value-right;}return value;};
 const value=expr();
 if(pos!==tokens.length||!Number.isFinite(value))throw Error('Invalid formula.');
 if(value<0||value>100000000)throw Error('Formula result must be ₱0–₱100,000,000.');
 return Math.round((value+Number.EPSILON)*100)/100;
}
export function normalizeVehicle(input,now=new Date().toISOString()){
  const make=text(input.make,80),model=text(input.model,100);
  const nickname=text(input.nickname,120);
  const name=nickname||[make,model].filter(Boolean).join(' ')||text(input.name,120);
  if(!name)throw Error('Enter a make and model, or a vehicle name.');
  const type=VEHICLE_TYPES.includes(input.type)?input.type:'Gasoline';
  const kmL=nonnegative(input.kmPerLiter,'Fuel economy (km/L)',100,{nullable:true});
  if(kmL!==null&&kmL===0)throw Error('Fuel economy must be above 0 when set.');
  const price=nonnegative(input.fuelPricePhp,'Fuel price (₱/L)',500,{nullable:true});
  return {id:input.id||crypto.randomUUID(),name,nickname,make,model,type,kmPerLiter:kmL,fuelPricePhp:price,notes:text(input.notes,900),createdAt:input.createdAt||now,updatedAt:now};
}
export function normalizeExpense(input,trip,now=new Date().toISOString()){
  const label=text(input.label,150);if(!label)throw Error('Expense description is required.');
  const date=input.date||null;
  const parsed=date?new Date(date+'T12:00:00Z'):null;
  if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<trip.startDate||date>trip.endDate||Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==date))throw Error('Expense date must be within the trip.');
  const plannedFormula=typeof input.plannedPhp==='string'&&input.plannedPhp.trim().startsWith('=')?input.plannedPhp.trim():null;
  const actualFormula=typeof input.actualPhp==='string'&&input.actualPhp.trim().startsWith('=')?input.actualPhp.trim():null;
  const plannedPhp=nonnegative(parseBudgetEntry(input.plannedPhp),'Planned cost (₱)',100000000,{nullable:true});
  const actualPhp=nonnegative(parseBudgetEntry(input.actualPhp),'Actual cost (₱)',100000000,{nullable:true});
  if(plannedPhp===null&&actualPhp===null)throw Error('Enter a planned or actual cost.');
  return {id:input.id||crypto.randomUUID(),tripId:trip.id,date,label,category:EXPENSE_CATEGORIES.includes(input.category)?input.category:'Other',plannedPhp,actualPhp,plannedFormula,actualFormula,notes:text(input.notes,1000),createdAt:input.createdAt||now,updatedAt:now};
}
export function normalizeLeg(input){
  const legDistanceKm=nonnegative(input.legDistanceKm,'Estimated driving distance (km)',100000,{nullable:true});
  const legTravelMinutes=nonnegative(input.legTravelMinutes,'Estimated travel time (minutes)',100800,{nullable:true});
  if(legTravelMinutes!==null&&!Number.isInteger(legTravelMinutes))throw Error('Travel time must be a whole number of minutes.');
  const legTollPhp=nonnegative(input.legTollPhp,'Estimated tolls (₱)',1000000,{nullable:true});
  return {legDistanceKm,legTravelMinutes,legTollPhp,legOrigin:text(input.legOrigin,120)};
}
const sum=(items,get)=>items.reduce((acc,item)=>acc+get(item),0);
/** Returns a PARTIAL or COMPLETE estimate. Explicit absence of values never becomes a zero-cost assumption. */
export function tripCostSummary({trip,stops=[],expenses=[],vehicle=null}){
  const knownDistance=stops.filter(s=>typeof s.legDistanceKm==='number'&&Number.isFinite(s.legDistanceKm));
  const distanceKm=sum(knownDistance,s=>s.legDistanceKm);
  const unknownDistanceCount=stops.length-knownDistance.length;
  const knownTolls=stops.filter(s=>typeof s.legTollPhp==='number'&&Number.isFinite(s.legTollPhp));
  const tollPhp=sum(knownTolls,s=>s.legTollPhp);
  const unknownTollCount=stops.length-knownTolls.length;
  const kmL=vehicle?.kmPerLiter, fuelPrice=vehicle?.fuelPricePhp;
  const fuelConfigured=Number.isFinite(kmL)&&kmL>0&&Number.isFinite(fuelPrice)&&fuelPrice>=0;
  const liters=fuelConfigured?distanceKm/kmL:null;
  const reserve=Number.isFinite(trip?.fuelReservePct)?trip.fuelReservePct:10;
  const fuelPhp=fuelConfigured?liters*fuelPrice*(1+reserve/100):null;
  const expPlanned=sum(expenses,e=>e.plannedPhp??0);
  const expActual=sum(expenses,e=>e.actualPhp??0);
  const plannedUnknown=expenses.filter(e=>e.plannedPhp===null||e.plannedPhp===undefined).length;
  const actualUnknown=expenses.filter(e=>e.actualPhp===null||e.actualPhp===undefined).length;
  const roadTimeKnown=stops.filter(s=>Number.isInteger(s.legTravelMinutes));
  return {distanceKm,unknownDistanceCount,tollPhp,unknownTollCount,
    roadMinutes:sum(roadTimeKnown,s=>s.legTravelMinutes),unknownTimeCount:stops.length-roadTimeKnown.length,
    liters,fuelPhp,fuelConfigured,reserve,expPlanned,expActual,plannedUnknown,actualUnknown,
    plannedSubtotal:expPlanned+tollPhp+(fuelPhp??0),
    estimateComplete:!!fuelConfigured&&unknownDistanceCount===0&&unknownTollCount===0&&plannedUnknown===0,
    estimatesSource:'manual-user-entered',liveTraffic:false,calculatedRoutes:false};
}
/** Do not silently reschedule fixed or flexible activities. Alert only on proven conflicts. */
export function travelFeasibility(stops){
  const issues=[];const days=new Map();
  for(const s of stops){if(!days.has(s.date))days.set(s.date,[]);days.get(s.date).push(s);}
  for(const [day,entries] of days){
    const ordered=entries.filter(s=>/^\d{2}:\d{2}$/.test(s.time||'')).sort((a,b)=>a.time.localeCompare(b.time));
    for(let i=1;i<ordered.length;i++){
      const prior=ordered[i-1],next=ordered[i];const priorMinutes=Number(prior.time.slice(0,2))*60+Number(prior.time.slice(3));
      const nextMinutes=Number(next.time.slice(0,2))*60+Number(next.time.slice(3));
      if(!Number.isInteger(next.legTravelMinutes))issues.push({kind:'unknown-travel-time',day,from:prior.id,to:next.id});
      else if(priorMinutes+(prior.durationMinutes||0)+next.legTravelMinutes>nextMinutes)issues.push({kind:'insufficient-transfer-time',day,from:prior.id,to:next.id,shortfallMinutes:priorMinutes+(prior.durationMinutes||0)+next.legTravelMinutes-nextMinutes});
    }
  }
  return issues;
}
