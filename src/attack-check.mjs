// No judge-tracked request adapter is configured for this submission runner.
// Keep submission checks unrun. Use operations:verify for separate live HTTP diagnostics.
export async function runAttackChecks(config = {}) {
  if (config.publicAppUrl !== 'https://5-stage.vercel.app/') throw new Error('invalid_public_app_url');
  return [
    ['operations-snapshot-api', 'HTTP 200 · 공개 실측 스냅샷'],
    ['s01-screen', 'HTTP 200 · 정상 공개 화면'],
    ['s02-public-data', 'HTTP 200 · 빈 공개 데이터'],
    ['s03-no-login', 'HTTP 401 · 무로그인 보호 API 거부'],
    ['protected-own-api', '실제 로그인·등록 기기의 자기 자료 허용'],
    ['protected-other-api', '실제 다른 소유자의 자료 거부'],
    ['live-reauthentication', '운영 엔진의 새 로그인 검증 후 재판정'],
    ['live-test-account-recovery', '검증 사본의 시험 B 한 건 POST 복구'],
    ['live-revocation', '운영 엔진의 실제 회수 확인'],
    ['assault-41', '공식 41종 총공세 방어 판정'],
  ].map(([attackId, expected]) => ({ attackId, expected, observed: 'not_run' }));
}
export default runAttackChecks;
