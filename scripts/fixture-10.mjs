import { randomUUID } from 'node:crypto';
import { objectHash, contentHash, previewMemo, previewPolicy, restorePolicy, restoreMemo, testPolicyAllows } from '../src/recovery.mjs';

// 실행할 때 생성하는 비공개 가상 데이터입니다. 실제 DB나 실제 계정의 사본이 아닙니다.
export function recoveryFixture() {
  const state = { testOnly: true, policies: {
    notes: { version: 'safe-v9', revision: 1, rules: { requireOwner: true, requireRegisteredDevice: true } },
    other_service: { version: 'keep-v1', rules: { readOnly: true } },
  }, memos: [
    { id: '1', owner_id: 'test-a', title: randomUUID(), body: randomUUID() },
    { id: '2', owner_id: 'test-b', title: randomUUID(), body: randomUUID() },
  ], audit: [{ action: 'before_incident' }] };
  const policyBackup = { schema: 'recovery.policy.v1', service: 'notes', version: 'safe-v9',
    rules: structuredClone(state.policies.notes.rules) };
  const approvedPolicyHash = objectHash(policyBackup);
  const memoBackup = { schema: 'recovery.memo.v1', version: 'safe-v9', id: '2', ownerId: 'test-b',
    title: state.memos[1].title, body: state.memos[1].body };
  const memoApproval = { version: memoBackup.version, id: memoBackup.id, ownerId: memoBackup.ownerId,
    contentHash: contentHash(memoBackup) };
  // 손상 시뮬레이션 전에 안전 정책 및 B 메모 사본을 검증합니다.
  previewPolicy(state, policyBackup, approvedPolicyHash);
  previewMemo(state.memos[1], memoBackup, memoApproval, 'test-b');
  state.policies.notes = { version: 'incident-v1', revision: 2,
    rules: { requireOwner: false, requireRegisteredDevice: false } };
  state.memos[1].body = randomUUID();
  state.audit.push({ action: 'simulated_incident' });
  return { state, policyBackup, approvedPolicyHash, memoBackup, memoApproval };
}

export function runRecoveryCheck() {
  const f = recoveryFixture();
  const policyPlan = previewPolicy(f.state, f.policyBackup, f.approvedPolicyHash);
  const policyState = restorePolicy(f.state, f.policyBackup, f.approvedPolicyHash, policyPlan.confirmation);
  const memoPlan = previewMemo(policyState.memos[1], f.memoBackup, f.memoApproval, 'test-b');
  const next = restoreMemo(policyState, f.memoBackup, f.memoApproval, 'test-b', { ...memoPlan, confirm: true });
  return {
    ownAllowed: testPolicyAllows(next, { actor: 'test-a', owner: 'test-a', deviceRegistered: true }),
    otherDenied: !testPolicyAllows(next, { actor: 'test-b', owner: 'test-a', deviceRegistered: true }),
    memoVerified: next.memos[1].id === f.memoBackup.id && next.memos[1].owner_id === f.memoBackup.ownerId
      && contentHash(next.memos[1]) === f.memoApproval.contentHash,
    otherMemoPreserved: objectHash(next.memos[0]) === objectHash(f.state.memos[0]),
    otherServicePreserved: objectHash(next.policies.other_service) === objectHash(f.state.policies.other_service),
    auditPreserved: objectHash(next.audit.slice(0, f.state.audit.length)) === objectHash(f.state.audit),
  };
}
