// Development-only fetch guard. No network writes are permitted during bundle.
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,options={})=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
 const method=(options.method??input?.method??'GET').toUpperCase();
 if(url.protocol!=='https:'||url.username||url.password||!url.hostname.includes('.')
   ||/^(?:localhost|127\.|10\.|192\.168\.)/u.test(url.hostname)||/\.(?:local|internal)$/u.test(url.hostname)
   ||!['GET','HEAD'].includes(method))throw new Error('sandbox_network_request_not_allowed');
 return originalFetch(input,options);
};
