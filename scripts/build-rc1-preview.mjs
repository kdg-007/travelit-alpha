import {cpSync,existsSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sealPreviewDirectory} from './preview-integrity.mjs';

/** Source-only preview assembler. No user records, credentials or live data are copied.
 * The ZIP is NOT deployed. A separate HTTPS origin is required for iPhone acceptance.
 */
export function buildRc1Preview({
 rootDir=fileURLToPath(new URL('../',import.meta.url)),
 outputDir=resolve(rootDir,'artifacts/rc1-preview')
}={}){
 rootDir=resolve(rootDir);
 outputDir=resolve(outputDir);
 if(outputDir===rootDir||rootDir.startsWith(outputDir+'/'))throw Error('Refusing to overwrite the source root.');
 const load=p=>readFileSync(join(outputDir,p),'utf8');
 const save=(p,s)=>writeFileSync(join(outputDir,p),s,'utf8');
 rmSync(outputDir,{recursive:true,force:true});
 mkdirSync(outputDir,{recursive:true});
 for(const directory of ['js','css','icons'])cpSync(join(rootDir,directory),join(outputDir,directory),{recursive:true});
 for(const name of ['index.html','sw.js','manifest.webmanifest'])cpSync(join(rootDir,name),join(outputDir,name));

 let db=load('js/db.js');
 if(!db.includes("const NAME='travelit-foundation'"))throw Error('Unexpected production database declaration.');
 db=db.replace("const NAME='travelit-foundation'","const NAME='travelit-rc1-preview'");
 save('js/db.js',db);

 let coordination=load('js/workspace-coordination.js');
 if(!coordination.includes("travelit-workspace-changes-v1"))throw Error('Unexpected workspace notification topic.');
 coordination=coordination.replaceAll('travelit-workspace-changes-v1','travelit-rc1-preview-workspace-changes-v1');
 save('js/workspace-coordination.js',coordination);

 let sw=load('sw.js');
 const header=/const CACHE='([^']+)';const SHELL=(\[[^\n]*\]);/.exec(sw);
 if(!header||!header[1].startsWith('travelit-foundation-shell-'))throw Error('Unrecognized service-worker metadata.');
 const cache='travelit-rc1-preview-shell-'+header[1].slice('travelit-foundation-shell-'.length);
 const assets=JSON.parse(header[2]);
 if(!assets.includes('./js/app.js'))throw Error('Main module is not in the shell cache.');
 assets.push('./js/preview-bootstrap.js');
 sw=sw.replace(header[0],"const CACHE='"+cache+"';const SHELL="+JSON.stringify(assets)+";");
 sw=sw.replaceAll("key.startsWith('travelit-foundation-shell-')","key.startsWith('travelit-rc1-preview-shell-')");
 save('sw.js',sw);

 let verifier=load('js/offline-shell.js');
 if(!verifier.includes('export const SHELL_CACHE_NAME='))throw Error('Missing offline shell verifier.');
 verifier=verifier.replace(/export const SHELL_CACHE_NAME="[^"]+";/,'export const SHELL_CACHE_NAME='+JSON.stringify(cache)+';');
 verifier=verifier.replace(/export const SHELL_ASSETS=Object.freeze\(\[[^\n]*\]\);/,'export const SHELL_ASSETS=Object.freeze('+JSON.stringify(assets)+');');
 if(!verifier.includes('./js/preview-bootstrap.js'))throw Error('Offline verifier was not updated.');
 save('js/offline-shell.js',verifier);

 let html=load('index.html');
 const match=/<script type="module" src="(js\/app\.js\?v=[^"]+)"><\/script>/.exec(html);
 if(!match)throw Error('Unexpected app entry point.');
 const entry='./'+match[1].slice(3);
 html=html.replace(match[0],'<script type="module" src="js/preview-bootstrap.js"></script>');
 html=html.replace('<title>TravelIt — Your journeys</title>','<title>TravelIt RC1 Preview — Test Only</title>');
 html=html.replace('<h1 id="page-heading">Explore</h1>','<h1 id="page-heading">Explore</h1><span class="preview-flag">RC1 PREVIEW · TEST DATA ONLY</span>');
 if(!html.includes('preview-flag'))throw Error('Could not add visible preview marker.');
 save('index.html',html);

 const boot=[
  '// RC1 preview refuses to run on the current GitHub Pages production origin.',
  '// This is an additional guard; it does not grant origin separation by path.',
  "const host=location.hostname.toLowerCase();",
  "const local=host==='localhost'||host==='127.0.0.1'||host==='[::1]';",
  "const unsafe=host==='kdg-007.github.io'||(location.protocol!=='https:'&&!local);",
  'if(unsafe){',
  " const root=document.querySelector('#main');",
  " if(root)root.textContent='This RC1 preview will not run on the existing GitHub Pages origin. Use a separate HTTPS hostname for testing.';",
  "}else{await import('"+entry+"');}"
 ].join('\n')+'\n';
 save('js/preview-bootstrap.js',boot);

 let css=load('css/style.css');
 css+='\n/* Test-only visual marker, absent from the live app. */\n.preview-flag{display:inline-block;margin-top:4px;font-size:10px;font-weight:850;color:#913c23;background:#fff1e8;padding:3px 6px;border:1px solid #edc4b2;border-radius:5px;letter-spacing:.3px}\n';
 save('css/style.css',css);

 const manifest=JSON.parse(load('manifest.webmanifest'));
 manifest.name='TravelIt RC1 Preview — Test Only';
 manifest.short_name='TravelIt Test';
 manifest.description='Synthetic-data-only TravelIt acceptance preview. Not the live app.';
 save('manifest.webmanifest',JSON.stringify(manifest,null,2)+'\n');

 const readme=[
  '# TravelIt RC1 Preview — NOT FOR PRODUCTION',
  '',
  'This ZIP contains static app files only. It does not contain personal information or local user data.',
  'All files are listed with SHA-256 digests in PREVIEW_INTEGRITY.json. This detects',
  'missing or altered files; it is not a publisher signature or a substitute for',
  'retrieving the package from the verified GitHub Actions release-candidate run.',
  'Only host it on an HTTPS ORIGIN DISTINCT from the existing TravelIt site. A different',
  'repository path under kdg-007.github.io is NOT an isolated origin and is intentionally blocked.',
  '',
  'Safeguards: separate IndexedDB name, separate BroadcastChannel/localStorage topic,',
  'separate service-worker cache namespace, visible TEST DATA ONLY banner and refusal',
  'to start on the existing GitHub Pages host.',
  '',
  'Do not enter real family records, private bookings, IDs or sensitive documents.',
  'Backup/export files are not encrypted. Map tiles require internet; offline routing is not implemented.',
  'No production deployment or automatic merge is performed by this package.',
  'The app refuses to start on the existing kdg-007.github.io origin or an',
  'insecure non-local HTTP origin. localhost HTTP is allowed for developer tests only.',
  '',
  'A future approved release must still pass a physical iPhone standalone PWA smoke test.',
  ''
 ].join('\n');
 save('PREVIEW_README.md',readme);
 if(!existsSync(join(outputDir,'js/preview-bootstrap.js')))throw Error('Preview bootstrap missing.');
 const integrity=sealPreviewDirectory(outputDir);
 return {outputDir,cache,assetCount:assets.length,appEntry:entry,integrityFiles:integrity.files.length};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=buildRc1Preview();
 process.stdout.write('TravelIt RC1 preview prepared: '+result.outputDir+' ('+result.assetCount+' cached assets)\n');
}
