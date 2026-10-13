export const VERIFICATION_PLAN = Object.freeze([
  {caseId:'s01-screen',stage:1,kind:'normal',label:'기존 접속 화면',expected:'HTTP 200',probe:'screen'},
  {caseId:'s02-public-data',stage:2,kind:'normal',label:'공개 데이터에 보호 자료 없음',expected:'HTTP 200 · 빈 배열',probe:'data'},
  {caseId:'s03-no-login',stage:3,kind:'forbidden',label:'무로그인 자료 API',expected:'HTTP 401',probe:'no-login'},
  {caseId:'s03-own-login',stage:3,kind:'normal',label:'로그인·등록 기기의 자기 메모',expected:'HTTP 200',probe:'own-memo'},
  {caseId:'s04-other-owner',stage:4,kind:'forbidden',label:'타인 소유 메모',expected:'HTTP 404',probe:'other-memo'},
  {caseId:'s05-origin-bypass',stage:5,kind:'forbidden',label:'원본 API 직접 우회',expected:'보호 자료 미노출'},
  {caseId:'s06-approved',stage:6,kind:'normal',label:'서버 기기 승인',expected:'HTTP 200 · approved',probe:'device'},
  {caseId:'s06-unregistered',stage:6,kind:'forbidden',label:'미등록 기기',expected:'deny · device_not_registered'},
  {caseId:'s07-usual',stage:7,kind:'normal',label:'엔진 정상 접속 판정',expected:'allow · approved'},
  {caseId:'s07-compound',stage:7,kind:'forbidden',label:'엔진 복합 이상 접속',expected:'step_up · step_up_required'},
  {caseId:'s08-own',stage:8,kind:'normal',label:'자기 메모 단건 읽기',expected:'HTTP 200',probe:'own-memo'},
  {caseId:'s08-other',stage:8,kind:'forbidden',label:'다른 구역 메모 단건',expected:'HTTP 404',probe:'other-memo'},
  {caseId:'s08-notice-write',stage:8,kind:'forbidden',label:'판정기 공지 쓰기',expected:'deny · starter_not_ready'},
  {caseId:'s08-list',stage:8,kind:'forbidden',label:'판정기 전체 목록',expected:'deny · starter_not_ready'},
  {caseId:'s09-normal',stage:9,kind:'normal',label:'운영 엔진 정상 사건',expected:'observe'},
  {caseId:'s09-burst',stage:9,kind:'forbidden',label:'운영 엔진 폭주 사건',expected:'propose_revocation · burst_read'},
  {caseId:'s09-revocation',stage:9,kind:'forbidden',label:'실제 회수 뒤 자료 접근',expected:'엔진 회수 확인 및 접근 거부'},
  {caseId:'s10-restored',stage:10,kind:'normal',label:'B 한 건 검증 복구 및 버전',expected:'POST HTTP 200 · 사본 해시 일치'},
  {caseId:'s10-invalid-backup',stage:10,kind:'forbidden',label:'손상/없는 사본 복구 중단',expected:'POST HTTP 409 · 복원 중단'},
  {caseId:'s11-approved',stage:11,kind:'normal',label:'승인 기기의 기존 자료 읽기',expected:'HTTP 200',probe:'own-memo'},
  {caseId:'s11-pending',stage:11,kind:'forbidden',label:'승인 전 보호 자료',expected:'HTTP 403 · 자료 없음'},
  {caseId:'s11-offline',stage:11,kind:'forbidden',label:'오프라인 보호 자료 캐시',expected:'보호 자료 미표시/미저장'},
]);
export const RULE_DESCRIPTIONS = Object.freeze({device_registered:'등록한 기기만 허용',step_up_required:'복합 이상 접속 추가 확인',resource_zones:'정확한 자료 구역과 경로 검사'});
export function pendingRows() {
  return VERIFICATION_PLAN.map(({probe,...row}) => ({...row, execution:'unrun',source:null,
    actual:null,requestId:null,requestIdSource:null,checkedAt:null,commit:null,matched:null}));
}
