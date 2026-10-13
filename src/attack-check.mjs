// Submission runner entry: deliberately no imports, packages, filesystem, process or server handlers.
// Read the same sanitized GET snapshot used by the operations screen.
export async function runAttackChecks(config = {}) {
  if (config.publicAppUrl !== 'https://5-stage.vercel.app/') throw new Error('invalid_public_app_url');
  const checks = [];
  let snapshot = null;
  let status = null;
  try {
    const response = await fetch('https://5-stage.vercel.app/api/operations-public', {
      method: 'GET', redirect: 'error', cache: 'no-store',
    });
    status = response.status;
    if (status === 200) snapshot = await response.json();
  } catch { /* No fabricated result on network or decoding failure. */ }
  const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
  const measured = rows.filter(row => row.execution === 'measured');
  const counts = snapshot?.counts;
  const valid = snapshot?.schema === 'aleph.operations.v1'
    && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(snapshot.snapshotId ?? '')
    && counts && counts.measured === measured.length
    && counts.matched === measured.filter(row => row.matched === true).length
    && counts.mismatched === measured.filter(row => row.matched === false).length
    && counts.unrun === rows.filter(row => row.execution === 'unrun').length
    && counts.errors === rows.filter(row => row.execution === 'error').length
    && counts.uniqueRequests === new Set(measured.map(row => row.requestId)).size
    && snapshot.assault?.execution === 'unrun' && snapshot.assault.confirmed === null;
  checks.push({ attackId: 'operations-snapshot-api', expected: 'GET 공개 실측 API HTTP 200 및 표/서버 기록 수치 일치',
    observed: valid ? `HTTP ${status} · snapshot ${snapshot.snapshotId} · measured=${counts.measured} matched=${counts.matched} unrun=${counts.unrun}`
      : status === null ? 'not_run' : `HTTP ${status} · snapshot_validation_failed` });
  for (const [caseId, expected] of [
    ['s01-screen', '실제 정상 공개 화면 HTTP 200'],
    ['s02-public-data', '실제 공개 데이터 HTTP 200 · 빈 배열'],
    ['s03-no-login', '실제 무로그인 보호 API HTTP 401'],
  ]) {
    const row = valid ? rows.find(row => row.caseId === caseId) : null;
    const safe = row?.execution === 'measured' && row.source === 'live_http'
      && /^HTTP [1-5][0-9]{2}(?: · (?:빈 배열|공개 파일 확인 실패|[a-z_]+))?$/u.test(row.actual ?? '')
      && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(row.requestId ?? '')
      && ['server', 'probe'].includes(row.requestIdSource)
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(row.checkedAt ?? '')
      && (row.commit === null || /^[a-f0-9]{40}$/u.test(row.commit ?? ''));
    checks.push({ attackId: caseId, expected,
      observed: safe ? JSON.stringify({ actual: row.actual, requestId: row.requestId,
        idSource: row.requestIdSource, checkedAt: row.checkedAt, commit: row.commit }) : 'not_run' });
  }
  for (const [attackId, expected] of [
    ['protected-own-api', '실제 로그인·등록 기기의 자기 자료 허용'],
    ['protected-other-api', '실제 다른 소유자의 자료 거부'],
    ['live-reauthentication', '운영 엔진의 새 로그인 검증 후 재판정'],
    ['live-test-account-recovery', '검증 사본의 시험 B 한 건 POST 복구'],
    ['live-revocation', '운영 엔진의 실제 회수 확인'],
    ['assault-41', '공식 41종 총공세 방어 판정'],
  ]) checks.push({ attackId, expected, observed: 'not_run' });
  return checks;
}
export default runAttackChecks;
