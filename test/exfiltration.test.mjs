import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {decide} from '../xdr/exfiltration/decide.mjs';
import {readAlerts,redact} from '../xdr/exfiltration/read-alerts.mjs';
import {respond,withExfiltration} from '../xdr/exfiltration/respond.mjs';
test('fixture, safe reader, response and expiry',async()=>{
 const {alerts}=JSON.parse(await readFile('xdr/fixtures/exfiltration.json'));
 assert.equal((await readAlerts()).length,alerts.length);
 assert.equal(redact('token=secret-value'),'[REDACTED]');
 assert.equal(alerts.filter(a=>decide(a).action==='block').length,10);
 for(const a of alerts.slice(10,20))assert.equal(decide(a).action,'alert',a.id);
 for(const a of alerts.slice(20))assert.equal(decide(a).action,'record',a.id);
 assert.equal(decide({rule:{level:12,mitre:['T1048'],description:'처음 보는 목적지'},data:{bytes:'0',dstip:'203.0.113.1'}}).action,'alert');
 assert.equal(decide({rule:{level:12,mitre:[]},data:{bytes:'999999999',dstip:'203.0.113.1'}}).action,'record');
 const root=await mkdtemp(join(tmpdir(),'exfiltration-'));
 try{
 const rules=await respond(alerts,{root,now:1000});
 const logged=(await readFile(join(root,'xdr','alerts.log'),'utf8')).trim().split('\n').map(JSON.parse);
 assert.deepEqual(logged.map(x=>x.alertId),alerts.slice(10,20).map(x=>x.id));
 const wrapped=withExfiltration(async()=>({action:'allow'}),rules);
 for(const a of alerts)assert.equal((await wrapped({}, {destinationAddress:a.data.dstip,now:1001})).action,decide(a).action==='block'?'block':'allow');
 assert.equal((await wrapped({}, {destinationAddress:alerts[0].data.dstip,now:1000000})).action,'allow');
 const shared=await respond([alerts[0],{id:'normal',data:{dstip:alerts[0].data.dstip,url:'/'}}],{root,now:1002});
 assert.ok(!shared.some(r=>r.destinationAddress===alerts[0].data.dstip));
 }finally{ /* Retain isolated test evidence in the generated temporary directory. */ }
 const source=await readFile('xdr/exfiltration/decide.mjs','utf8');
 assert.ok(!/\bimport\b/.test(source));
 const {SourceTextModule,createContext}=await import('node:vm');
 const m=new SourceTextModule(source,{context:createContext({})});await m.link(()=>{throw Error('import forbidden')});await m.evaluate();
 for(const a of alerts)assert.equal(m.namespace.decide(a).action,decide(a).action);
 const patterns=JSON.parse(await readFile('xdr/exfiltration/patterns.json','utf8'));
 assert.deepEqual(JSON.parse(source.slice(source.indexOf('['),source.indexOf('];')+1)),patterns);
 assert.ok(patterns.every(p=>p.evidence&&p.condition&&p.name));
});
