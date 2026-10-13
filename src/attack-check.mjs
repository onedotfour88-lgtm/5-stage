// Standalone submission runner: no imports, packages or server-side proxy receipts.
// Every measured item sends its own GET with the same attackId; unexecuted items stay not_run.
export async function runAttackChecks(config = {}) {
  if (config.publicAppUrl !== 'https://5-stage.vercel.app/') throw new Error('invalid_public_app_url');
  const checks = [];
  for (const [attackId, path, expected] of [
    ['operations-snapshot-api', '/api/operations-public', 'HTTP 200 · 공개 실측 스냅샷'],
    ['s01-screen', '/', 'HTTP 200 · 정상 공개 화면'],
    ['s02-public-data', '/data.json', 'HTTP 200 · 빈 공개 데이터'],
    ['s03-no-login', '/api/memos/1', 'HTTP 401 · 무로그인 보호 API 거부'],
  ]) {
    let observed = 'not_run';
    let status = null;
    try {
      // attackId is runner trace metadata, never an identity/role/device approval assertion.
      const response = await fetch('https://5-stage.vercel.app' + path, {
        method: 'GET', attackId, headers: { 'X-Aleph-Attack-Id': attackId, 'X-Attack-Id': attackId },
        redirect: 'error', cache: 'no-store',
      });
      status = response.status;
      let detail = '';
      if (attackId === 's02-public-data' && status === 200) {
        const data = await response.json();
        detail = Array.isArray(data) && data.length === 0 ? ' · 빈 배열' : ' · 공개 데이터 검증 실패';
      }
      if (attackId === 'operations-snapshot-api' && status === 200) {
        const data = await response.json();
        const rows = Array.isArray(data?.rows) ? data.rows : [];
        const measured = rows.filter(row => row.execution === 'measured');
        const consistent = data?.schema === 'aleph.operations.v1'
          && data.counts?.measured === measured.length
          && data.counts?.matched === measured.filter(row=>row.matched===true).length
          && data.counts?.mismatched === measured.filter(row=>row.matched===false).length
          && data.counts?.uniqueRequests === new Set(measured.map(row=>row.requestId)).size
          && data.counts?.unrun === rows.filter(row => row.execution === 'unrun').length
          && data.counts?.errors === rows.filter(row => row.execution === 'error').length
          && data.counts?.normalAllowed === measured.filter(row=>row.kind==='normal'&&/^HTTP 2[0-9]{2}(?: |$)/u.test(row.actual??'')&&row.matched===true).length
          && data.counts?.forbiddenBlocked === measured.filter(row=>row.kind==='forbidden'&&/^HTTP (401|403|404)(?: |$)/u.test(row.actual??'')&&row.matched===true).length
          && data.assault?.executed === 0 && data.assault.blocked === 0
          && data.assault.allowed === 0 && data.assault.notRun === 41;
        detail = consistent ? ' · 기록 수치 일치 · 총공세 미실행' : ' · 기록 수치 검증 실패';
      }
      // This receipt belongs to this direct request, not nested requests inside an API response.
      const id = response.headers?.get?.('x-request-id');
      const safeId = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(id ?? '') ? id : 'not_provided';
      observed = `HTTP ${status}${detail} · requestId=${safeId} · checkedAt=${new Date().toISOString()}`;
    } catch {
      if (status !== null) observed = `HTTP ${status} · 응답 검증 실패`;
    }
    checks.push({ attackId, expected, observed });
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
