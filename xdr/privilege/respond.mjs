import {appendFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {isIP} from 'node:net';
import {decide} from './decide.mjs';
// Resolve this tuple from trusted account/session inventory, never browser claims.
export function sessionKey({account,sourceAddress}={}){
 if(typeof account!=='string'||!account||account.length>128||!isIP(sourceAddress??''))return null;
 return createHash('sha256').update(JSON.stringify([account,sourceAddress])).digest('hex');
}
export async function respond(alerts,{root,now=Date.now(),ttlMs=900000,revokeSession}={}){
 if(!root||!Number.isFinite(now)||!Number.isFinite(ttlMs)||ttlMs<=0)throw Error('invalid_options');
 const dir=join(root,'xdr','privilege');await mkdir(dir,{recursive:true});
 const path=join(dir,'deny-rules.json');let rules=[];
 try{rules=JSON.parse(await readFile(path,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
 rules=rules.filter(r=>Date.parse(r.expiresAt)>now);
 for(const alert of alerts){
  const decision=decide(alert),alertId=/^[a-z0-9_.-]{1,80}$/i.test(alert?.id??'')?alert.id:null;
  if(decision.action==='alert')await appendFile(join(root,'xdr','alerts.log'),JSON.stringify({alertId,...decision})+'\n');
  const key=sessionKey({account:alert?.data?.srcuser,sourceAddress:alert?.data?.srcip});
  if(decision.action!=='block'||!alertId||!key)continue;
  const rule={id:'xdr.privilege.'+alertId,action:'deny',sessionKey:key,alertId,expiresAt:new Date(now+ttlMs).toISOString(),reason:decision.reason};
  rules=rules.filter(r=>r.id!==rule.id);rules.push(rule);
 }
 await writeFile(path,JSON.stringify(rules,null,2)+'\n');
 if(revokeSession)for(const rule of rules)await revokeSession(rule);
 return rules;
}
export function withPrivilege(baseDecide,rules){
 return async(request,{account,sourceAddress,now=Date.now()}={})=>{
  const key=sessionKey({account,sourceAddress});
  const match=key&&rules.find(r=>r.sessionKey===key&&Date.parse(r.expiresAt)>now);
  return match?{action:'block',reason:match.reason,alertId:match.alertId}:baseDecide(request);
 };
}
