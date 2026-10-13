# 탈환 작전실과 재현 범위

화면 /operations.html, 서버 GET/POST /api/operations, CLI npm run operations:verify.
학생 판정·탐지·회수·복구의 실제 결과가 확인되는 범위만 표시합니다. 12단계 판정/41종 방어의 운영 결과가 없으므로 최종 클리어를 선언하지 않습니다.

## 결과의 출처와 확인표

- ruleSummary: 실제 src/decider.mjs의 RULE_IDS를 읽은 학생 코드 요약입니다. 운영 엔진 적용 이력이나 공격 방어 횟수가 아닙니다.
- detection: 운영 사건 조회 계약이 없으므로 eventCount=null, execution=unrun입니다. 로컬 detect:test 결과를 사건 통계로 넣지 않습니다.
- revocation: propose_revocation은 회수 제안이며 회수 완료가 아닙니다. 기기 상태 API가 revoked를 반환했더라도 회수 요청/완료 시각과 경과 시간은 별도 증거가 없어 미확인으로 표시합니다.
- recovery: 같은 인증 사용자에게 성공한 학생 복구 API 응답의 version만 표시합니다. 현재 서버 인스턴스에서 이 응답을 관찰하지 못했으면 null/미실행입니다. 기본 safe-v9 값이나 로컬 시험 버전을 운영 결과로 채우지 않습니다.
- assault: total=41, confirmed=null, execution=not_run, observed=not_run. 공식 41종 목록·실행 계약은 미제공입니다. 이 화면의 22개 대표 확인 항목은 41종 목록을 대체하지 않습니다.

확인표는 src/operations-plan.mjs의 1~11단계 대표 정상/금지 요청·기대값을 사용합니다. POST /api/operations는 정해진 현재 자료실 HTTPS 주소에 **GET만** 보내며 공개 화면/빈 공개 데이터/무로그인 API/기기 상태/선택한 단건 메모 읽기만 실행합니다. 메모 본문을 응답표나 로그에 복사하지 않습니다. 쓰기·탐지 공격·회수·복구·원본 API 우회·오프라인 시험은 이 버튼으로 실행하지 않고 미실행으로 둡니다.

로그인 세션 없이 CLI를 실행하면 공개 정상 2항목과 무로그인 금지 1항목만 실측됩니다. 본인 메모 ID와 타인 소유로 별도 확인된 ID를 제공하지 않으면 단건 요청은 미실행입니다. 404는 거부 응답 증거이며 그 ID가 실제 타인 소유라는 별도 사실을 증명하지는 않습니다.

행의 source=live_http는 서버/CLI가 실제 배포 URL로 보낸 HTTP 응답입니다. source=student_server_api는 실제 학생 API 응답을 관찰한 기록입니다. API 대역 단위 시험은 테스트 프로세스에서만 수행하며 운영 실측 표에 넣지 않습니다.

HTTP 실패·503·예상 밖 상태는 통과로 바꾸지 않습니다. matched는 기대한 HTTP 결과와의 일치만 뜻하며 심판 통과를 뜻하지 않습니다. 동일 단건 결과를 3·8·11단계에서 재사용하면 같은 요청 ID를 표시합니다. counts.measured는 확인표 행 수, counts.uniqueRequests는 서로 다른 요청 수입니다.

실제 서버 X-Request-ID가 UUID이면 requestIdSource=server로 기록합니다. 정적 파일이나 기존 배포에서 이 헤더가 없으면 로컬 probe UUID를 만들어 requestIdSource=probe로 구분합니다. probe ID를 서버가 발급했다고 주장하지 않습니다. checkedAt은 실제 수신/관찰 시각 UTC ISO입니다. 서버가 X-Student-Commit을 제공하지 않으면 해당 API의 commit은 null입니다. CLI의 inspectedCommit은 로컬 기준이며 배포 커밋을 대신하지 않습니다.

## 가린 감사 기록과 보존 한계

자료·기기·복구 핸들러는 X-Request-ID와 같은 ID로 aleph.student.audit.v1 로그를 남깁니다. 사용자 번호는 단방향 지문의 24자리로 가리고 method/service/status/등록부 이유 코드/시각/확인한 배포 커밋만 남깁니다. 성공한 복구 버전은 안전한 ASCII 형식만 허용합니다. URL·쿼리·헤더 원문·본문·메모 제목/내용·토큰·실명·쿠키·원본 사용자 ID는 로그에 넣지 않습니다.

작전실의 ‘가린 서버 응답’은 화면 수치를 계산한 동일 스냅샷 JSON입니다. 읽기 전용 확인 결과는 사용자별 15분·최대 50사용자, 같은 사용자의 재실행은 30초 간격입니다. 현재 프로세스 API 로그는 전체 최대 500건 중 자기 기록 최근 100건만 볼 수 있습니다. 다른 사용자의 기록은 조회하지 않습니다.

Vercel 함수 인스턴스는 메모리를 공유하거나 영구 보존한다고 보장하지 않습니다. 다른 함수/인스턴스의 복구 기록을 못 읽거나 재시작되면 미조회로 남습니다. 서버의 가린 구조화 로그는 배포 플랫폼에서 같은 요청 ID로 대조합니다. 통합 영구 감사 DB/운영 엔진 이력 조회 연결은 미구현입니다. 원래 복구 감사 이력과 DB는 수정하지 않습니다.

## 실행과 정지

Node.js 22 이상, 현재 프로젝트의 package.json 의존성을 사용합니다. 새 접속 프로그램·키·인증서를 만들지 않습니다. 필요한 환경에서는 npm install로 프로젝트 의존성만 준비합니다(이번 작업에서 설치 미실행).

1. git rev-parse HEAD와 git status --short로 기준 커밋과 다른 작업을 확인합니다. 검사할 커밋을 별도 체크아웃에서 사용하고 다른 작업을 삭제하지 않습니다.
2. npm run build, npm run test:12, npm run test:11, npm run test:8, npm run decider:test, npm run fixture:7, npm run test:9, npm run detect:test, npm run test:10을 순서대로 실행합니다. 가상/대역 시험과 실제 HTTP 결과를 구분합니다.
3. npm run operations:preview — http://127.0.0.1:4173/operations.html에서 빈 확인표와 요약을 미리 봅니다. 보호 API나 엔진을 시작하지 않으며 인증/실측 버튼이 비활성화됩니다. Ctrl+C로 이 프로세스만 중지합니다.
4. 실제 배포 후 자료실의 ‘탈환 작전실’ → 로그인 → 내 메모/별도 확인한 타인 ID(선택) → ‘실제 API 확인 실행’. 임의의 role·사용자·기기 ID를 넣지 않습니다.
5. npm run operations:verify는 고정 배포 URL의 비파괴 GET만 수행합니다. 결과 JSON/HTML은 artifacts/operations-verification.*에 저장하고 Git/제출 묶음에 넣지 않습니다. 이미 프로세스의 비밀 환경에 OPERATIONS_ACCESS_TOKEN/OPERATIONS_DEVICE_SESSION이 제공된 경우에만 인증 실측을 수행합니다. 값 자체를 셸 명령·README·Git에 적지 않습니다. 자료 ID 변수는 OPERATIONS_OWN_MEMO_ID/OPERATIONS_OTHER_MEMO_ID입니다. 명령은 확인 후 자동 종료합니다.
6. 화면 로그아웃은 메모리 인증과 표시 결과를 제거합니다. 원격 Vercel API를 브라우저 닫기로 중지했다고 주장하지 않습니다. 운영 중지는 배포 관리자가 제공 엔진/서비스 절차로 수행합니다. 저장소에 제공되지 않은 엔진 설치·중지 명령은 만들지 않습니다.

## 학생 몫과 제공 엔진

학생 코드: src/decider.mjs, src/detect.mjs, 자료/복구 API, public 접속 앱/manifest, 작전실 및 확인 절차.
제공 엔진: **ALEPH SDP 엔진**. 신원·실제 기기·엔진 정책 전달·회수와 총공세 판정은 제공 엔진 책임입니다. 이 저장소는 엔진 설치 묶음이나 엔진 구현을 포함하지 않습니다. docs/DECIDER_REQUEST.md, DETECT_EVENTS.md가 현재 제공 입력 계약입니다. docs/ACCESS_APP.md는 학생 연결 어댑터이며 공식 승인 API 계약으로 표시하지 않습니다.

서버 설정 이름만 사용: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEVICE_APPROVAL_ORIGIN, 복구용 RECOVERY_TEST_MODE=isolated/RECOVERY_TEST_USER_ID. 실제 값은 배포 플랫폼의 비공개 설정에 둡니다. VERCEL_GIT_COMMIT_SHA가 있는 실행에서는 그 커밋을 기록합니다. 원본 API·로그인 발급자·기존 허용 경로·judgeIssuer는 바꾸지 않습니다.

## 복구와 재현

화면 새로고침을 복구로 부르지 않습니다. 검증한 정책/메모 사본이 있는 시험 환경에서만 docs/RECOVERY.md의 preview-policy → 확인한 confirmation으로 restore-policy, preview-memo → 확인한 해시로 restore-memo를 수행합니다. 기존 .recovery-test가 있으면 init을 다시 실행해 덮어쓰지 않습니다. 실제 B의 POST 복구는 관리자 사전 사본/승인/환경이 갖춰진 경우에만 미리보기 후 명시적으로 실행합니다. 작전실은 복구 API를 자동 호출하지 않습니다.

복구 뒤 위 정상/금지 시험을 다시 수행하고 실제 HTTP 확인표를 새로 생성합니다. 이전 자료·다른 서비스·감사 이력·다른 XDR 작업을 보존합니다. 예전 확인 결과를 새 커밋/새 복구 성공으로 복사하지 않습니다. 운영 41종은 심판이 확인할 때까지 미실행입니다.


## 현재 제출과 공개 실측

제출 runner는 요청을 보내지 않고 10개 항목 모두 observed=not_run으로 반환합니다. 공개 /api/operations-public는 화면/빈 데이터/무인증 API를 실제 GET으로 확인하며 화면과 가린 JSON에 같은 스냅샷을 제공합니다. 이를 제출 runner 요청 기록으로 복사하지 않습니다.

공식 실행 기록이 없으므로 assault.checks는 빈 배열입니다. 총 41종, 실행/차단/허용 0, 미실행 41, observed=not_run입니다. 대표 22행과 공식 41종은 별개입니다. 공개 API 응답의 counts/assault/rows/탐지/회수/복구를 같은 snapshotId로 서버 로그에도 기록하여 화면과 대조합니다.
