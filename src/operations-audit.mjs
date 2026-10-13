import { randomUUID, createHash } from 'node:crypto';
const subjects = new WeakMap();
const journal = [];
export function readAuditRows(subject) {
  return journal.filter(row => row.subject === subject).slice(-100).map(row => ({...row}));
}
export const REASONS = Object.freeze(['approved','login_required','invalid_login','device_not_registered',
  'approval_service_unavailable','server_not_configured','resource_not_found','instructor_required',
  'method_not_allowed','invalid_content','resource_unavailable','invalid_recovery_request',
  'preview_confirmation_required','test_account_required','backup_missing','backup_verification_failed',
  'restore_verification_failed','recovery_unavailable']);
export function maskedSubject(userId) {
  return createHash('sha256').update(String(userId)).digest('hex').slice(0,24);
}
export function setAuditSubject(req, userId) { subjects.set(req, maskedSubject(userId)); }
export function instrumentApi(handler, kind, { emit = row => console.info(JSON.stringify(row)) } = {}) {
  return async (req, res) => {
    const requestId = randomUUID();
    res.setHeader('X-Request-ID', requestId);
    if (/^[a-f0-9]{40}$/u.test(process.env.VERCEL_GIT_COMMIT_SHA ?? '')) res.setHeader('X-Student-Commit',process.env.VERCEL_GIT_COMMIT_SHA);
    res.setHeader('Access-Control-Expose-Headers', 'X-Request-ID, X-Student-Commit');
    const json = res.json.bind(res), end = res.end?.bind(res);
    let recorded = false;
    function record(payload) {
      if (recorded) return; recorded = true;
      const status = res.statusCode ?? res.code;
      const row = { schema:'aleph.student.audit.v1', source:'student_server_api', requestId,
        checkedAt:new Date().toISOString(), commit:/^[a-f0-9]{40}$/u.test(process.env.VERCEL_GIT_COMMIT_SHA ?? '') ? process.env.VERCEL_GIT_COMMIT_SHA : null,
        service:kind, method:['GET','POST','PUT','PATCH','DELETE','OPTIONS'].includes(req.method) ? req.method : 'UNKNOWN',
        subject:subjects.get(req) ?? null, httpStatus: Number.isInteger(status) ? status : null,
        reasonCode:REASONS.includes(payload?.error) ? payload.error : null };
      if (kind === 'device' && status === 200 && ['pending','approved','denied','revoked'].includes(payload?.status)) row.deviceStatus = payload.status;
      if (kind === 'recovery-restore' && status === 200 && /^[A-Za-z0-9_-]{1,80}$/u.test(payload?.version ?? '')) row.recoveryVersion = payload.version;
      journal.push(Object.freeze(row));
      if (journal.length > 500) journal.shift();
      try { emit(Object.freeze(row)); } catch { /* Logging cannot change an access decision. */ }
    }
    res.json = payload => { record(payload); return json(payload); };
    if (end) res.end = (...args) => { record(null); return end(...args); };
    try { return await handler(req,res); }
    finally { res.json=json; if(end) res.end=end; }
  };
}
