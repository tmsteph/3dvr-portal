// 3DVR Worlds API: isolated Node handler for integration into the portal's authenticated server.
// Auth must be supplied by the host; this module never trusts client-provided owner IDs.
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const SLUG=/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])?$/;
const KINDS=new Set(['box','tree','tower']);
const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data))};
export function validateScene(scene){
  if(!scene||scene.version!==1||typeof scene.name!=='string'||scene.name.length>80||!Array.isArray(scene.objects)||scene.objects.length>100)throw Error('Invalid scene');
  const ids=new Set();
  const objects=scene.objects.map(o=>{
    if(!o||typeof o.id!=='string'||o.id.length>64||ids.has(o.id)||!KINDS.has(o.kind)||![o.x,o.z,o.scale].every(Number.isFinite)||Math.abs(o.x)>15||Math.abs(o.z)>15||o.scale<.5||o.scale>3)throw Error('Invalid object');
    ids.add(o.id);return {id:o.id,kind:o.kind,x:o.x,z:o.z,scale:o.scale};
  });
  return {version:1,name:scene.name,objects};
}
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>64000)throw Error('Payload too large')}return JSON.parse(raw)}
export function createWorldsHandler({directory,authenticate}){
  if(!directory||typeof authenticate!=='function')throw Error('Worlds requires storage directory and host authentication');
  const file=slug=>join(directory,slug+'.json');
  return async function handleWorlds(req,res){
    try{
      const url=new URL(req.url,'http://localhost');
      const match=/^\/api\/worlds\/([a-z0-9-]+)$/.exec(url.pathname);
      if(!match||!SLUG.test(match[1]))return json(res,404,{error:'Not found'});
      const slug=match[1];
      if(req.method==='GET'){
        const record=JSON.parse(await readFile(file(slug),'utf8').catch(e=>{if(e.code==='ENOENT')return 'null';throw e}));
        if(!record)return json(res,404,{error:'Not found'});
        if(record.published)return json(res,200,{slug,scene:record.scene,published:true,updatedAt:record.updatedAt});
        const owner=await authenticate(req);
        return owner&&owner===record.owner?json(res,200,{slug,scene:record.scene,published:false,updatedAt:record.updatedAt}):json(res,404,{error:'Not found'});
      }
      if(!['PUT','DELETE'].includes(req.method))return json(res,405,{error:'Method not allowed'});
      const owner=await authenticate(req);
      if(typeof owner!=='string'||!owner)return json(res,401,{error:'Sign in required'});
      // Host must enforce CSRF protection for cookie sessions and request rate limits.
      await mkdir(directory,{recursive:true,mode:0o700});
      const current=JSON.parse(await readFile(file(slug),'utf8').catch(e=>{if(e.code==='ENOENT')return 'null';throw e}));
      if(current&&current.owner!==owner)return json(res,403,{error:'Forbidden'});
      if(req.method==='DELETE'){
        if(!current)return json(res,404,{error:'Not found'});
        // Unpublish without deleting owner data; deletion can be implemented separately.
        const next={...current,published:false,updatedAt:new Date().toISOString()};
        const tmp=file(slug)+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(next),{mode:0o600});await rename(tmp,file(slug));
        return json(res,200,{slug,published:false});
      }
      const data=await body(req);
      if(typeof data.published!=='boolean')return json(res,400,{error:'published must be boolean'});
      const scene=validateScene(data.scene);
      const next={owner,scene,published:data.published,updatedAt:new Date().toISOString()};
      const tmp=file(slug)+'.'+randomUUID()+'.tmp';await writeFile(tmp,JSON.stringify(next),{mode:0o600});await rename(tmp,file(slug));
      return json(res,200,{slug,published:next.published,updatedAt:next.updatedAt});
    }catch(e){
      if(e instanceof SyntaxError||e.message==='Invalid scene'||e.message==='Invalid object'||e.message==='Payload too large')return json(res,400,{error:e.message});
      console.error('worlds API error',e);return json(res,500,{error:'Server error'});
    }
  };
}
