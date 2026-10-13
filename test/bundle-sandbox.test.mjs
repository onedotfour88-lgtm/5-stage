import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from './bundle-sandbox-loader.mjs';
import '../test/bundle-sandbox-setup.mjs';
import { runAttackChecks } from '../src/attack-check.mjs';
test('격리 점검기는 node:net과 npm 패키지를 차단한다',async()=>{
 const next=async specifier=>({url:specifier});
 await assert.rejects(resolve('node:net',{},next),/sandbox_unsupported_import/);
 await assert.rejects(resolve('@supabase/supabase-js',{},next),/sandbox_package_not_allowed/);
 assert.equal((await resolve('node:fs',{},next)).url,'node:fs');
 await assert.rejects(fetch('https://5-stage.vercel.app/',{method:'POST'}),/sandbox_network_request_not_allowed/);
});
test('제출 자기 점검은 API 핸들러 없이 완료하며 미실행은 not_run이다',async()=>{
 const checks=await runAttackChecks({step:12});
 assert.equal(checks.length,19); // No publicAppUrl means no external HTTP probe in this unit test.
 for(const id of ['access-app-unapproved-api','live-test-account-recovery','live-reauthentication','live-resource-zones']){
  assert.equal(checks.find(row=>row.attackId===id)?.observed,'not_run');
 }
 assert.ok(checks.every(row=>Object.keys(row).sort().join(',')==='attackId,expected,observed'));
});
