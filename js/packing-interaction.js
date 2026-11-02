/**
 * TravelIt local packing checkbox coordinator.
 * Resolve a save only after the guarded IndexedDB transaction commits.
 * Returns explicit failure so UI restores the previous checked value.
 * Never reports cloud synchronization.
 */
export async function persistPackingToggle(item,checked,save,{now=()=>new Date().toISOString()}={}){
 if(!item?.id || typeof save!=='function')return {ok:false,error:new Error('Packing item cannot be saved.')};
 try{
  await save({...item,packed:Boolean(checked),updatedAt:now()});
  return {ok:true};
 }catch(error){return {ok:false,error};}
}
