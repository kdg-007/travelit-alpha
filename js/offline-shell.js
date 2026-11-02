/** Independent, non-destructive check of TravelIt's installed offline app shell.
 * This checks CacheStorage entries, not future device persistence or map-navigation readiness.
 * Cache existence is NOT proof of an intact response body; do not label a successful check as permanent storage.
 */
export const SHELL_CACHE_NAME="travelit-foundation-shell-v0.29.0";
export const SHELL_ASSETS=Object.freeze(["./","./index.html","./css/style.css","./js/app.js","./js/db.js","./js/local-health.js","./js/offline-shell.js","./js/workspace-coordination.js","./js/domain.js","./js/keepit-associations.js","./js/liveit-projections.js","./js/backup.js","./js/restore-impact.js","./js/trip-brief.js","./js/trip-preparation.js","./js/on-the-road.js","./js/map-tools.js","./js/map-view.js","./js/offline-map-pack.js","./js/map-catalog.js","./js/map-navigation.js","./js/osm-street-import.js","./js/region-atlas.js","./js/atlas-pack-tools.js","./js/atlas-renderer.js","./js/packing-templates.js","./js/packing-interaction.js","./js/trip-costs.js","./js/travel-planning.js","./js/today-schedule.js","./icons/icon.svg","./manifest.webmanifest"]);

/** Dependency injection is intentional: tests need no real service worker and cannot contact the network.
 * `scope` must be the service worker scope URL, never the current page query string.
 */
export async function verifyOfflineShell({cacheStorage=globalThis.caches,serviceWorker=globalThis.navigator?.serviceWorker,scope=globalThis.location?.origin+'/',registration=null}={}){
  const missing=[],faults=[];
  let controlled=Boolean(serviceWorker?.controller);
  if(!cacheStorage?.keys||!cacheStorage?.open){return {ready:false,controlled,cached:0,total:SHELL_ASSETS.length,missing:[...SHELL_ASSETS],reason:'CacheStorage is unavailable.'};}
  try{
    if(!registration && serviceWorker?.getRegistration) registration=await serviceWorker.getRegistration(scope);
    if(registration?.scope)scope=registration.scope;
    const keys=await cacheStorage.keys();
    if(!keys.includes(SHELL_CACHE_NAME))return {ready:false,controlled,cached:0,total:SHELL_ASSETS.length,missing:[...SHELL_ASSETS],reason:'Current-version offline cache is missing.'};
    // Open only after keys() proves the named cache exists: avoid creating an empty cache as a side effect.
    const cache=await cacheStorage.open(SHELL_CACHE_NAME);
    const root=new URL(scope);
    for(const asset of SHELL_ASSETS){
      const requestUrl=new URL(asset,root).href;
      try{const response=await cache.match(requestUrl);
        if(!response?.ok)missing.push(asset);
      }catch{missing.push(asset);faults.push(asset);}
    }
    const cached=SHELL_ASSETS.length-missing.length;
    const ready=controlled&&missing.length===0;
    const reason=!controlled?'The installed service worker does not control this page yet. Reload after installation.':missing.length?`${missing.length} offline file(s) are missing or invalid. Reload online to repair the cache.`:'Offline application files are cached in this browser. Device persistence is not guaranteed.';
    return {ready,controlled,cached,total:SHELL_ASSETS.length,missing,reason,faults};
  }catch(error){return {ready:false,controlled,cached:0,total:SHELL_ASSETS.length,missing:[...SHELL_ASSETS],reason:`Could not inspect offline cache: ${error?.message||'unknown error'}`};}
}
