import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {decide} from '../xdr/known-cve/decide.mjs';
import {readAlerts,redact} from '../xdr/known-cve/read-alerts.mjs';
import {respond,withKnownCve} from '../xdr/known-cve/respond.mjs';
test('fixture, safe reader, response and expiry',async()=>{
 const {alerts}=JSON.parse(await readFile('xdr/fixtures/known-cve.json'));
 assert.equal((await readAlerts()).length,alerts.length);
 assert.equal(redact('token=secret-value'),'[REDACTED]');
 assert.equal(alerts.filter(a=>decide(a).action==='block').length,8);
 for(const a of alerts.slice(8))assert.notEqual(decide(a).action,'block');
 assert.equal(decide({data:{url:'${jndi:'}}).action,'alert');
 assert.equal(decide({data:{useragent:'log4j-scanner'}}).action,'alert');
 const root=await mkdtemp(join(tmpdir(),'known-cve-'));
 try{
 const rules=await respond(alerts,{root,now:1000});
 const wrapped=withKnownCve(async()=>({action:'allow'}),rules);
 for(const a of alerts)assert.equal((await wrapped({}, {sourceAddress:a.data.srcip,now:1001})).action,decide(a).action==='block'?'block':'allow');
 assert.equal((await wrapped({}, {sourceAddress:alerts[0].data.srcip,now:1000000})).action,'allow');
 const shared=await respond([alerts[0],{id:'normal',data:{srcip:alerts[0].data.srcip,url:'/'}}],{root,now:1002});
 assert.ok(!shared.some(r=>r.sourceAddress===alerts[0].data.srcip));
 }finally{await rm(root,{recursive:true,force:true})}
 const source=await readFile('xdr/known-cve/decide.mjs','utf8');
 assert.ok(!/\bimport\b/.test(source));
});
