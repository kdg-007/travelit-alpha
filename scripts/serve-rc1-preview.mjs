import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildRc1Preview} from './build-rc1-preview.mjs';
import {verifyPreviewDirectory} from './preview-integrity.mjs';

// This server exposes only the generated synthetic preview, not repository source.
const TYPES={
 '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8',
 '.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8',
 '.webmanifest':'application/manifest+json','.svg':'image/svg+xml',
 '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'
};
function safePath(directory,requestURL){
 const pathname=decodeURIComponent(new URL(requestURL,'http://preview.local').pathname);
 if(pathname.includes('\0')||pathname.includes('\\'))throw Error('Invalid request');
 const file=pathname.endsWith('/')?pathname+'index.html':pathname;
 const output=resolve(directory,'.'+file);
 if(output!==directory&&!output.startsWith(directory+sep))throw Error('Unsafe path');
 return output;
}
export function createPreviewServer({directory,host='127.0.0.1',port=8000}={}){
 if(!directory)throw Error('Preview directory required');
 directory=resolve(directory);
 verifyPreviewDirectory(directory);
 const server=createServer(async(req,res)=>{
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,headers);res.end();return;}
  let file;
  try{file=safePath(directory,req.url||'/');}
  catch{res.writeHead(400,headers);res.end('Invalid preview path');return;}
  try{
   const details=await stat(file);
   if(!details.isFile())throw Error('Non-file request');
   const bytes=await readFile(file);
   res.writeHead(200,{...headers,'Content-Type':TYPES[extname(file).toLowerCase()]||'application/octet-stream','Content-Length':bytes.length});
   res.end(req.method==='HEAD'?undefined:bytes);
  }catch{res.writeHead(404,headers);res.end('Not found');}
 });
 server.listen(port,host);
 return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const preview=buildRc1Preview();
 const server=createPreviewServer({directory:preview.outputDir,host:'0.0.0.0',port:Number(process.env.PORT||8000)});
 server.on('listening',()=>process.stdout.write('TravelIt RC1 synthetic preview started on port '+server.address().port+'\n'));
 server.on('error',error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
}
