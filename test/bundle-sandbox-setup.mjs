// Development-only fetch guard. No network writes are permitted during bundle.
import { mkdirSync, writeFileSync } from 'node:fs';
const originalFetch=globalThis.fetch;
const trace=[];
globalThis.fetch=async(input,options={})=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
 const method=(options.method??input?.method??'GET').toUpperCase();
 if(url.protocol!=='https:'||url.username||url.password||!url.hostname.includes('.')
   ||/^(?:localhost|127\.|10\.|192\.168\.)/u.test(url.hostname)||/\.(?:local|internal)$/u.test(url.hostname)
   ||!['GET','HEAD'].includes(method))throw new Error('sandbox_network_request_not_allowed');
 const attackId=options.attackId;
 if(!/^[a-z0-9][a-z0-9_.-]{0,79}$/u.test(attackId??'')||options.headers?.['X-Aleph-Attack-Id']!==attackId)throw new Error('sandbox_attack_id_missing');
 const row={attackId,method,url:url.href,status:null,checkedAt:null};trace.push(row);
 const response=await originalFetch(input,options);
 row.status=response.status;row.checkedAt=new Date().toISOString();
 return response;
};
process.once('beforeExit',()=>{
 mkdirSync('artifacts',{recursive:true});
 writeFileSync('artifacts/bundle-request-trace.json',JSON.stringify(trace,null,2)+'\n');
});
