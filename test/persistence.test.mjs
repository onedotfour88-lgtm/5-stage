import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {decide} from '../xdr/persistence/decide.mjs';
import {readAlerts,redact} from '../xdr/persistence/read-alerts.mjs';
import {respond,withPersistence} from '../xdr/persistence/respond.mjs';
test('fixture, safe reader, response and expiry',async()=>{
 const {alerts}=JSON.parse(await readFile('xdr/fixtures/persistence.json'));
 assert.equal((await readAlerts()).length,alerts.length);
 assert.equal(redact('token=secret-value'),'[REDACTED]');
 assert.equal(alerts.filter(a=>decide(a).action==='block').length,8);
 for(const a of alerts.slice(8,16))assert.equal(decide(a).action,'alert',a.id);
 for(const a of alerts.slice(16))assert.equal(decide(a).action,'record',a.id);
 assert.equal(decide({rule:{level:12,mitre:['T1543'],description:'서명은 아직 모릅니다. 서비스 점검'},data:{path:'C:/lab/tool.exe'}}).action,'alert');
 assert.equal(decide({rule:{level:3,mitre:['T1053'],description:'기존 예약 작업'}}).action,'record');
 assert.equal(decide({rule:{level:12,mitre:[]},data:{path:'C:/Temp/tool.exe'}}).action,'record');
 const root=await mkdtemp(join(tmpdir(),'persistence-'));
 try{
 const rules=await respond(alerts,{root,now:1000});
 const logged=(await readFile(join(root,'xdr','alerts.log'),'utf8')).trim().split('\n').map(JSON.parse);
 assert.deepEqual(logged.map(x=>x.alertId),alerts.slice(8,16).map(x=>x.id));
 const wrapped=withPersistence(async()=>({action:'allow'}),rules);
 for(const a of alerts)assert.equal((await wrapped({}, {sourceAddress:a.data.srcip,now:1001})).action,decide(a).action==='block'?'block':'allow');
 assert.equal((await wrapped({}, {sourceAddress:alerts[0].data.srcip,now:1000000})).action,'allow');
 const shared=await respond([alerts[0],{id:'normal',data:{srcip:alerts[0].data.srcip,url:'/'}}],{root,now:1002});
 assert.ok(!shared.some(r=>r.sourceAddress===alerts[0].data.srcip));
 }finally{ /* Retain isolated test evidence in the generated temporary directory. */ }
 const source=await readFile('xdr/persistence/decide.mjs','utf8');
 assert.ok(!/\bimport\b/.test(source));
 const patterns=JSON.parse(await readFile('xdr/persistence/patterns.json','utf8'));
 assert.deepEqual(JSON.parse(source.slice(source.indexOf('['),source.indexOf('];')+1)),patterns);
 assert.ok(patterns.every(p=>p.evidence&&p.condition&&p.name));
});
