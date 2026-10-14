import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SourceTextModule,createContext} from 'node:vm';
import {decide} from '../xdr/privilege/decide.mjs';
import {respond,withPrivilege} from '../xdr/privilege/respond.mjs';
import {readAlerts,redact} from '../xdr/privilege/read-alerts.mjs';
test('privilege classification, isolated execution, safe reading and session isolation',async()=>{
 const raw=await readFile('xdr/fixtures/privilege.json','utf8');const {alerts}=JSON.parse(raw);
 const rows=await readAlerts();assert.equal(rows.length,26);assert.ok(rows.every(r=>Object.keys(r).length===5));assert.equal(redact('token=hidden'),'[REDACTED]');
 const source=await readFile('xdr/privilege/decide.mjs','utf8');
 const m=new SourceTextModule(source,{context:createContext({})});await m.link(()=>{throw Error('unexpected import')});await m.evaluate();
 assert.deepEqual(JSON.parse(source.slice(source.indexOf('['),source.indexOf('];')+1)),JSON.parse(await readFile('xdr/privilege/patterns.json')));
 for(let i=0;i<alerts.length;i++){const expected=i<9?'block':i<17?'alert':'record';assert.equal(decide(alerts[i]).action,expected);assert.equal(m.namespace.decide(alerts[i]).action,expected)}
 assert.equal(decide({rule:{level:12,mitre:['T1068'],description:'업무 시간 밖'}}).action,'alert');
 assert.equal(decide({rule:{level:3,mitre:['T1078']},data:{group:'administrators'}}).action,'record');
 const root=await mkdtemp(join(tmpdir(),'privilege-test-'));const revoked=[];
 const rules=await respond(alerts,{root,now:1000,revokeSession:r=>revoked.push(r)});assert.equal(revoked.length,9);
 const gate=withPrivilege(async()=>({action:'allow'}),rules);
 for(let i=0;i<alerts.length;i++)assert.equal((await gate({}, {account:alerts[i].data.srcuser,sourceAddress:alerts[i].data.srcip,now:1001})).action,i<9?'block':'allow');
 assert.equal((await gate({}, {account:'another-user',sourceAddress:alerts[0].data.srcip,now:1001})).action,'allow');
 assert.equal((await gate({}, {account:alerts[0].data.srcuser,sourceAddress:alerts[0].data.srcip,now:901000})).action,'allow');
 const lines=(await readFile(join(root,'xdr','alerts.log'),'utf8')).trim().split('\n').map(JSON.parse);assert.deepEqual(lines.map(x=>x.alertId),alerts.slice(9,17).map(x=>x.id));
 const again=await respond(alerts,{root,now:1000});assert.equal(again.length,9);
 assert.equal(await readFile('xdr/fixtures/privilege.json','utf8'),raw);
});
