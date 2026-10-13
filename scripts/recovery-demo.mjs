import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { recoveryFixture } from './fixture-10.mjs';
import { previewPolicy, restorePolicy, previewMemo, restoreMemo, contentHash, testPolicyAllows } from '../src/recovery.mjs';

const dir = resolve(import.meta.dirname, '..', '.recovery-test');
const statePath = join(dir, 'state.json');
const backupPath = join(dir, 'private-backups.json');
const lockPath = join(dir, 'restore.lock');
let restoreLock;
const load = path => { if (!existsSync(path)) throw new Error('backup_missing'); return JSON.parse(readFileSync(path,'utf8')); };
const save = state => {
  const tmp = join(dir, 'state.pending.json');
  writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
  renameSync(tmp, statePath);
};
try {
  const [action, confirmation] = process.argv.slice(2);
  if (action === 'init') {
    if (existsSync(statePath) || existsSync(backupPath)) throw new Error('test_fixture_already_exists');
    const { state, ...backups } = recoveryFixture();
    mkdirSync(dir, { recursive: true });
    writeFileSync(backupPath, JSON.stringify(backups), { flag: 'wx', mode: 0o600 });
    save(state);
    console.log('시험 환경 생성: 사전 사본 검증 뒤 가상 손상 적용. 실제 운영 데이터 변경 없음.');
  } else {
    if (['restore-policy','restore-memo'].includes(action)) {
      if (!existsSync(dir)) throw new Error('backup_missing');
      try { restoreLock = openSync(lockPath,'wx'); } catch { throw new Error('recovery_busy'); }
    }
    const state = load(statePath), backup = load(backupPath);
    const plan = previewPolicy(state, backup.policyBackup, backup.approvedPolicyHash);
    if (action === 'preview-policy') console.log(JSON.stringify(plan, null, 2));
    else if (action === 'restore-policy') {
      const next = restorePolicy(state, backup.policyBackup, backup.approvedPolicyHash, confirmation);
      save(next);
      console.log(JSON.stringify({ restoredVersion: next.policies.notes.version,
        ownAllowed: testPolicyAllows(next,{actor:'test-a',owner:'test-a',deviceRegistered:true}),
        otherDenied: !testPolicyAllows(next,{actor:'test-b',owner:'test-a',deviceRegistered:true}),
        auditPreserved: JSON.stringify(next.audit.slice(0,state.audit.length)) === JSON.stringify(state.audit) }));
    } else if (action === 'preview-memo') {
      console.log(JSON.stringify(previewMemo(state.memos[1],backup.memoBackup,backup.memoApproval,'test-b'),null,2));
    } else if (action === 'restore-memo') {
      // 로컬 시험 전용입니다. 서버 API 복구는 POST preview/restore를 사용합니다.
      const current = previewMemo(state.memos[1],backup.memoBackup,backup.memoApproval,'test-b');
      if (confirmation !== current.expectedCurrentHash) throw new Error('preview_confirmation_required');
      const next = restoreMemo(state,backup.memoBackup,backup.memoApproval,'test-b',{...current,confirm:true});
      save(next);
      console.log(JSON.stringify({id:'2',contentHash:contentHash(next.memos[1]),
        auditPreserved:JSON.stringify(next.audit.slice(0,state.audit.length))===JSON.stringify(state.audit)}));
    } else throw new Error('use_init_preview-policy_restore-policy_preview-memo_restore-memo');
  }
} catch (error) {
  const allowed = ['backup_missing','backup_verification_failed','preview_confirmation_required','invalid_test_state',
    'test_fixture_already_exists','resource_not_found','restore_verification_failed','recovery_busy'];
  console.error(allowed.includes(error.message) ? error.message : 'recovery_demo_failed');
  process.exitCode = 1;
} finally {
  if (restoreLock !== undefined) { closeSync(restoreLock); unlinkSync(lockPath); }
}
