import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';

export function publicAddress(address) {
  if (isIP(address) === 4) {
    const [a,b] = address.split('.').map(Number);
    return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127);
  }
  if (isIP(address) === 6) return !/^(::|fc|fd|fe[89ab])/i.test(address);
  return false;
}

export function installDocumentRoutes(app, resources) {
  const documents = new Map(resources.filter(r=>/^https:\/\//.test(r.url||'')).map(r=>[r.id,r]));
  const cache = new Map(), pending = new Map();
  const MAX_FILE = 40*1024*1024, MAX_CACHE = 64*1024*1024;
  let cachedBytes=0;
  async function download(item) {
    if(cache.has(item.id)) return cache.get(item.id);
    let target=new URL(item.url);const approvedHost=target.hostname;
    for(let redirect=0;redirect<=3;redirect++) {
      if(target.protocol!=='https:'||target.hostname!==approvedHost||target.username||target.password)throw Error('source_redirect_restricted');
      const addresses=await lookup(target.hostname,{all:true});
      if(!addresses.length||addresses.some(x=>!publicAddress(x.address)))throw Error('source_address_restricted');
      const response=await fetch(target,{redirect:'manual',signal:AbortSignal.timeout(25000),headers:{Accept:'application/pdf', 'User-Agent':'Jobandkill-Admissions-DocumentReader/1.0'}});
      if([301,302,303,307,308].includes(response.status)) {
        const location=response.headers.get('location');await response.body?.cancel();if(!location)throw Error('source_redirect_invalid');target=new URL(location,target);continue;
      }
      if(!response.ok){await response.body?.cancel();throw Error('source_unavailable');}
      if(Number(response.headers.get('content-length'))>MAX_FILE){await response.body?.cancel();throw Error('document_too_large');}
      const reader=response.body.getReader(),chunks=[];let bytes=0;
      while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>MAX_FILE){await reader.cancel();throw Error('document_too_large');}chunks.push(Buffer.from(part.value));}
      const content=Buffer.concat(chunks);
      if(!content.subarray(0,1024).includes(Buffer.from('%PDF-')))throw Error('source_is_not_pdf');
      while(cachedBytes+content.length>MAX_CACHE&&cache.size){const first=cache.keys().next().value;cachedBytes-=cache.get(first).length;cache.delete(first);}
      cache.set(item.id,content);cachedBytes+=content.length;return content;
    }
    throw Error('too_many_redirects');
  }
  app.get('/api/documents/:id',async(request,response)=>{
    const item=documents.get(request.params.id);
    if(!item)return response.status(404).json({error:'document_not_registered'});
    if(!pending.has(item.id)&&!cache.has(item.id)&&pending.size>=3)return response.status(429).json({error:'document_reader_busy'});
    try {
      if(!pending.has(item.id)) pending.set(item.id,download(item).finally(()=>pending.delete(item.id)));
      const bytes=await pending.get(item.id);
      response.set({'Content-Type':'application/pdf','Content-Length':String(bytes.length),'X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=3600','Content-Disposition':`${request.query.download==='1'?'attachment':'inline'}; filename="${item.id.replace(/[^a-zA-Z0-9_-]/g,'_')}.pdf"`});
      response.send(bytes);
    }catch(error){response.status(502).json({error:error?.name==='TimeoutError'?'source_timeout':String(error.message||'document_unavailable'),sourceUrl:item.url});}
  });
}
