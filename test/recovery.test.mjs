import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recoveryFixture } from '../scripts/fixture-10.mjs';
import { previewPolicy, restorePolicy, previewMemo, restoreMemo, contentHash, testPolicyAllows, objectHash } from '../src/recovery.mjs';
import { createRecoveryHandler } from '../src/recovery-api.mjs';

test('정책 미리보기는 버전·변경 범위를 표시하고 원본을 변경하지 않음', () => {
  const f = recoveryFixture(), before = structuredClone(f.state);
  const plan = previewPolicy(f.state,f.policyBackup,f.approvedPolicyHash);
  assert.equal(plan.toVersion,'safe-v9');
  assert.deepEqual(plan.changes.map(item=>item.key),['requireOwner','requireRegisteredDevice']);
  assert.deepEqual(f.state,before);
});

test('사본 없음·위조·다른 서비스·확인 누락·미리보기 후 변경은 정책 복원 중단', () => {
  const f=recoveryFixture(), before=structuredClone(f.state);
  const plan=previewPolicy(f.state,f.policyBackup,f.approvedPolicyHash);
  assert.throws(()=>previewPolicy(f.state,null,f.approvedPolicyHash),/backup_missing/);
  assert.throws(()=>previewPolicy(f.state,{...f.policyBackup,version:'tampered'},f.approvedPolicyHash),/backup_verification_failed/);
  const other={...f.policyBackup,service:'other_service'};
  assert.throws(()=>previewPolicy(f.state,other,objectHash(other)),/backup_verification_failed/);
  assert.throws(()=>restorePolicy(f.state,f.policyBackup,f.approvedPolicyHash,null),/preview_confirmation_required/);
  const changed=structuredClone(f.state);changed.policies.notes.revision++;
  assert.throws(()=>restorePolicy(changed,f.policyBackup,f.approvedPolicyHash,plan.confirmation),/preview_confirmation_required/);
  assert.deepEqual(f.state,before);
});

test('시험 정책 복원 뒤 A 정상 허용·B의 A 거부, 다른 서비스와 감사 이력 보존', () => {
  const f=recoveryFixture(),plan=previewPolicy(f.state,f.policyBackup,f.approvedPolicyHash);
  assert.equal(testPolicyAllows(f.state,{actor:'test-b',owner:'test-a',deviceRegistered:true}),true);
  const next=restorePolicy(f.state,f.policyBackup,f.approvedPolicyHash,plan.confirmation);
  assert.equal(testPolicyAllows(next,{actor:'test-a',owner:'test-a',deviceRegistered:true}),true);
  assert.equal(testPolicyAllows(next,{actor:'test-b',owner:'test-a',deviceRegistered:true}),false);
  assert.equal(testPolicyAllows(next,{actor:'test-a',owner:'test-a',deviceRegistered:false}),false);
  assert.deepEqual(next.policies.other_service,f.state.policies.other_service);
  assert.deepEqual(next.audit.slice(0,f.state.audit.length),f.state.audit);
  assert.deepEqual(next.memos,f.state.memos);
});

test('B 메모 한 건의 ID·소유자·내용 해시 복구, 다른 메모와 감사 이력 보존', () => {
  const f=recoveryFixture(),plan=previewMemo(f.state.memos[1],f.memoBackup,f.memoApproval,'test-b');
  const next=restoreMemo(f.state,f.memoBackup,f.memoApproval,'test-b',{...plan,confirm:true});
  assert.equal(next.memos[1].id,f.memoBackup.id);
  assert.equal(next.memos[1].owner_id,f.memoBackup.ownerId);
  assert.equal(contentHash(next.memos[1]),f.memoApproval.contentHash);
  assert.deepEqual(next.memos[0],f.state.memos[0]);
  assert.deepEqual(next.audit.slice(0,f.state.audit.length),f.state.audit);
  assert.deepEqual(next.policies,f.state.policies);
});

test('메모 ID·소유자·본문 위조, 타인 접근, 확인 누락·오래된 확인 모두 중단', () => {
  const f=recoveryFixture(),before=structuredClone(f.state);
  for(const overrides of [{id:'1'},{ownerId:'test-a'},{body:'synthetic-change'}]) {
    assert.throws(()=>previewMemo(f.state.memos[1],{...f.memoBackup,...overrides},f.memoApproval,'test-b'),/backup_verification_failed/);
  }
  assert.throws(()=>previewMemo(f.state.memos[1],f.memoBackup,f.memoApproval,'test-a'),/resource_not_found/);
  assert.throws(()=>restoreMemo(f.state,f.memoBackup,f.memoApproval,'test-b',{}),/preview_confirmation_required/);
  const plan=previewMemo(f.state.memos[1],f.memoBackup,f.memoApproval,'test-b');
  const changed=structuredClone(f.state);changed.memos[1].body='another-change';
  assert.throws(()=>restoreMemo(changed,f.memoBackup,f.memoApproval,'test-b',{...plan,confirm:true}),/preview_confirmation_required/);
  assert.deepEqual(f.state,before);
});

test('현재 소유자도 손상되었으면 승인된 B 사본으로 복원하고 확인 뒤 소유자 변경은 중단', () => {
  const f=recoveryFixture();f.state.memos[1].owner_id='tampered-owner';
  const plan=previewMemo(f.state.memos[1],f.memoBackup,f.memoApproval,'test-b');
  const next=restoreMemo(f.state,f.memoBackup,f.memoApproval,'test-b',{...plan,confirm:true});
  assert.equal(next.memos[1].owner_id,'test-b');
  assert.equal(contentHash(next.memos[1]),f.memoApproval.contentHash);
  const changed=structuredClone(f.state);changed.memos[1].owner_id='another-owner';
  assert.throws(()=>restoreMemo(changed,f.memoBackup,f.memoApproval,'test-b',{...plan,confirm:true}),/preview_confirmation_required/);
});

async function api(action,context,options={}) {
  const req={method:'POST',url:`/api/recovery/memos/2/${action}`,headers:{authorization:'Bearer fixture'},
    body:{version:'safe-v9'},...options};
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},
    json(body){this.body=body;return this;}};
  await createRecoveryHandler(action,{getContext:async()=>context})(req,res);
  return res;
}

test('직접 POST는 인증된 시험 B만 확인된 한 건 복원, 응답에 내용/토큰 없음', async () => {
  const f=recoveryFixture();let current=f.state;
  const context={testUserId:'test-b',verify:async()=> 'test-b',async execute(id,version,actor,apply,confirmation){
    if(id!==f.memoBackup.id||version!==f.memoBackup.version)throw new Error('backup_missing');
    const plan=previewMemo(current.memos[1],f.memoBackup,f.memoApproval,actor);
    if(!apply)return {...plan,body:'synthetic-hidden',token:'synthetic-hidden'};
    current=restoreMemo(current,f.memoBackup,f.memoApproval,actor,confirmation);
    return {id,ownerId:actor,version,contentHash:contentHash(current.memos[1]),body:'synthetic-hidden'};
  }};
  const preview=await api('preview',context);
  assert.equal(preview.code,200);
  assert.deepEqual(Object.keys(preview.body).sort(),['expectedBackupHash','expectedCurrentHash','id','ownerId','version']);
  const restored=await api('restore',context,{body:{version:'safe-v9',confirm:true,
    expectedCurrentHash:preview.body.expectedCurrentHash,expectedBackupHash:preview.body.expectedBackupHash}});
  assert.equal(restored.code,200);
  assert.equal(restored.body.contentHash,f.memoApproval.contentHash);
  assert.deepEqual(Object.keys(restored.body).sort(),['contentHash','id','ownerId','version']);
  assert.deepEqual(current.memos[0],f.state.memos[0]);
});

test('POST 무인증·A 계정·본문 권한 위조·사본 없음은 짧은 오류로 거부', async () => {
  const context={testUserId:'test-b',verify:async()=> 'test-a',execute:async()=> {throw new Error('must_not_execute');}};
  assert.equal((await api('preview',context,{headers:{}})).code,401);
  assert.equal((await api('preview',context)).code,403);
  assert.equal((await api('preview',context,{body:{version:'safe-v9',role:'instructor'}})).code,400);
  assert.equal((await api('restore',context)).code,409);
  const missing={...context,verify:async()=> 'test-b',execute:async()=>{throw new Error('backup_missing');}};
  assert.deepEqual((await api('preview',missing)).body,{error:'backup_missing'});
  assert.equal((await api('preview',context,{method:'GET'})).code,405);
});
