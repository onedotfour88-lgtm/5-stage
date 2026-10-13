import { createHash } from 'node:crypto';
import { validDataId } from './resources.mjs';

export const digest = value => createHash('sha256').update(value).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const objectHash = value => digest(JSON.stringify(canonical(value)));
// 길이로 구분하므로 제목/본문에 구분 문자가 있어도 모호하지 않습니다.
export const contentHash = ({ title, body }) => {
  if (typeof title !== 'string' || typeof body !== 'string') throw new Error('invalid_backup');
  return digest(`${Buffer.byteLength(title, 'utf8')}:${title}${Buffer.byteLength(body, 'utf8')}:${body}`);
};
const frame = value => `${Buffer.byteLength(value, 'utf8')}:${value}`;
export const memoStateHash = row => digest(frame(String(row.id)) + frame(String(row.owner_id)) + frame(contentHash(row)));
const fail = reason => { throw new Error(reason); };
const versionValid = version => typeof version === 'string' && /^[A-Za-z0-9_-]{1,80}$/u.test(version);

export function previewPolicy(state, backup, approvedHash) {
  if (!backup) fail('backup_missing');
  if (state?.testOnly !== true || backup.schema !== 'recovery.policy.v1' || backup.service !== 'notes'
      || !versionValid(backup.version) || !backup.rules || backup.rules.requireOwner !== true
      || backup.rules.requireRegisteredDevice !== true || Object.keys(backup.rules).length !== 2
      || objectHash(backup) !== approvedHash) fail('backup_verification_failed');
  const current = state.policies?.notes;
  if (!current || !versionValid(current.version) || !Number.isSafeInteger(current.revision)
      || current.revision < 0 || current.revision >= Number.MAX_SAFE_INTEGER || !current.rules
      || Object.keys(current.rules).some(key => !['requireOwner','requireRegisteredDevice'].includes(key)
        || typeof current.rules[key] !== 'boolean') || !Array.isArray(state.audit)) fail('invalid_test_state');
  const keys = [...new Set([...Object.keys(current.rules), ...Object.keys(backup.rules)])].sort();
  const plan = { service: 'notes', fromVersion: current.version, toVersion: backup.version,
    expectedRevision: current.revision, currentHash: objectHash(current), backupHash: approvedHash,
    changes: keys.filter(key => current.rules[key] !== backup.rules[key]).map(key => ({ key,
      before: current.rules[key] ?? null, after: backup.rules[key] ?? null })) };
  return { ...plan, confirmation: objectHash(plan) };
}

export function restorePolicy(state, backup, approvedHash, confirmation) {
  const plan = previewPolicy(state, backup, approvedHash);
  if (!confirmation || confirmation !== plan.confirmation) fail('preview_confirmation_required');
  const next = structuredClone(state);
  next.policies.notes = { ...next.policies.notes, version: backup.version, revision: plan.expectedRevision + 1,
    rules: structuredClone(backup.rules) };
  next.audit.push({ action: 'restore_test_policy', service: 'notes', version: backup.version,
    previousHash: plan.currentHash, restoredHash: approvedHash });
  return next;
}

export function testPolicyAllows(state, { actor, owner, deviceRegistered }) {
  const rules = state.policies.notes.rules;
  return (!rules.requireRegisteredDevice || deviceRegistered === true) && (!rules.requireOwner || actor === owner);
}

export function previewMemo(current, backup, approval, actor) {
  if (!backup || !approval) fail('backup_missing');
  if (backup.schema !== 'recovery.memo.v1' || !validDataId(backup.id) || !versionValid(backup.version)
      || backup.id !== approval.id || backup.ownerId !== approval.ownerId || backup.version !== approval.version
      || contentHash(backup) !== approval.contentHash) fail('backup_verification_failed');
  // 승인된 사전 사본의 소유자를 확인합니다. 손상된 현재 소유자 값은 권한 근거로 쓰지 않습니다.
  if (actor !== backup.ownerId || !current || String(current.id) !== backup.id) fail('resource_not_found');
  return { id: backup.id, ownerId: backup.ownerId, version: backup.version,
    expectedCurrentHash: memoStateHash(current), expectedBackupHash: approval.contentHash };
}

export function restoreMemo(state, backup, approval, actor, confirmation) {
  const index = state.memos.findIndex(row => String(row.id) === backup?.id);
  const plan = previewMemo(state.memos[index], backup, approval, actor);
  if (confirmation?.confirm !== true || confirmation.expectedCurrentHash !== plan.expectedCurrentHash
      || confirmation.expectedBackupHash !== plan.expectedBackupHash) fail('preview_confirmation_required');
  const next = structuredClone(state);
  next.memos[index] = { ...next.memos[index], owner_id: backup.ownerId, title: backup.title, body: backup.body };
  if (contentHash(next.memos[index]) !== plan.expectedBackupHash) fail('restore_verification_failed');
  next.audit.push({ action: 'restore_test_memo', id: plan.id, version: plan.version,
    previousHash: plan.expectedCurrentHash, restoredHash: plan.expectedBackupHash });
  return next;
}
