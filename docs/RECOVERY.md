# 10단계 시험 영역 복구

운영 정책과 기존 `public.memos`는 변경하지 않습니다. 정책은 로컬 시험 상태의
`notes` 서비스만, 서버 메모 복구는 별도 `recovery_test_*` 테이블의 시험 B 자료 한 건만 대상으로 합니다.
기존 자료실 화면·메뉴·주소와 접속 판정 응답은 유지합니다.

## 정책 사본 미리보기와 확인

최초 한 번 `npm run recovery:demo -- init`을 실행합니다. 실제 자료를 읽지 않고 비공개 가상
A/B 메모와 안전 정책을 생성하여 사본을 검증한 다음에만 손상을 시뮬레이션합니다.
이미 시험 상태가 있으면 덮어쓰지 않고 중단합니다. 현재 작업에서 이 초기화 및 복구는 실행했습니다.

1. `npm run recovery:demo -- preview-policy`
2. 출력의 서비스, 현재/복원 버전, 변경 규칙 및 해시를 확인합니다.
3. `npm run recovery:demo -- restore-policy <출력된 confirmation>`

사본 없음·해시/스키마/안전 규칙 검증 실패·확인 누락·미리보기 이후 상태 변경이면 중단합니다.
다른 서비스 규칙, 메모 및 기존 감사 이력을 보존하고 새 복구 감사 기록만 추가합니다.
동시 로컬 복원은 잠금 파일로 차단합니다. 운영 정책 파일이나 ZTNA 설정에 쓰지 않습니다.

## B의 비공개 가상 메모 한 건

로컬에서는 `npm run recovery:demo -- preview-memo`로 ID·소유자·버전·확인 해시를 보고,
`npm run recovery:demo -- restore-memo <expectedCurrentHash>`로 시험 B의 ID 2 한 건을 복구합니다.
`.recovery-test/private-backups.json`과 `state.json`은 비공개 가상 데이터를 포함하므로
Git·public·제출 묶음에 넣지 않습니다. 본문을 콘솔이나 응답에 출력하지 않습니다.

서버 서비스 이름: **recovery_test**. 실제 POST 경로:

- `POST /api/recovery/memos/:id/preview` — 본문 `{"version":"safe-v9"}`.
- `POST /api/recovery/memos/:id/restore` — 본문은 `version`, `confirm:true`,
  미리보기에서 받은 `expectedCurrentHash`, `expectedBackupHash` 네 항목입니다.

인증된 시험 B만 호출합니다. 본문으로 소유자·역할·제목·내용을 지정할 수 없습니다.
응답은 ID·소유자·버전·해시만 포함합니다. 다른 계정은 403, 사본 없음/검증 실패/확인 불일치는
409, 잘못된 인증은 401, 모르는 자료는 404입니다. 오류에 토큰·메모 내용·DB 오류 세부 정보를 넣지 않습니다.

## 실제 DB 준비 — 아직 미실행

`docs/RECOVERY_TEST.sql`은 시험 전용 테이블과 RPC의 준비 SQL입니다.
관리자는 적용 전에 pgcrypto의 `extensions` 설치 위치를 확인해야 합니다.
실제 기존 메모·정책·감사 테이블을 수정하거나 사본을 현재 손상 자료로 대체하지 않습니다.

실제 시험 B의 사전 비공개 사본과 별도의 승인 기록을 관리자가 준비해야 합니다.
`captured_at <= approved_at < incident_at` 및 ID·소유자·내용 해시가 맞아야 복구됩니다.
사본/승인 테이블은 서버에서 읽기만 가능하며 감사 테이블은 추가만 가능합니다.
현재 행의 소유자가 손상되어도 권한 근거는 사전 승인된 B 소유자입니다.
현재 상태 확인 해시에 ID·현재 소유자·내용을 함께 묶고, 복원 후 ID·소유자·내용 해시를 재확인합니다.
RPC는 행 잠금 아래 한 건 복원과 감사 추가를 처리하며 검증 오류는 예외로 중단합니다.
RPC 호출 방식과 실행 권한은 [Supabase 공식 문서](https://supabase.com/docs/guides/database/functions)를 기준으로 구성했습니다.

서버 환경 설정은 이름만 기록합니다: `RECOVERY_TEST_MODE=isolated`, `RECOVERY_TEST_USER_ID`(시험 B UUID),
기존 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. 실제 값과 사본 내용은 배포 설정/비공개 DB에서만 관리합니다.
테이블·사전 사본·승인·시험 B 설정이 없으면 서버 복구는 실패하도록 되어 있습니다.
설치할 새 접속 프로그램, 새 개인키, 인증서는 없습니다.

## 실행 및 검증 범위

`npm run test:10`은 새 가상 사본/손상 상태와 인증·저장소 대역으로 10개 복구 시험을 실행합니다.
실제 B 토큰으로 배포 API 호출, SQL 적용, 운영 엔진 복구 경로 연결과 실제 DB 복구는 미실행입니다.
정책/B 메모 로컬 복구 및 공개 화면/빈 데이터/무로그인 API 401은 실제로 확인했습니다.
1~9단계 재시험의 정상·금지 결과 및 미실행 항목은 README의 재확인 표를 따릅니다.

### 백업 재조회 보강

POST restore는 실제 복원 호출 전에 저장소의 사본을 다시 조회·검증합니다.
ID·소유자·버전·백업 해시가 확인값과 맞지 않거나 사본이 없으면 복원 호출 자체를 중단합니다.
현재 상태 해시가 달라도 다시 미리보기가 필요합니다. RPC 내부 재조회·잠금 검증은 그대로 유지합니다.
로컬 CLI도 적용 직전에 사본 파일을 다시 읽고 최초 승인값과 비교합니다.
