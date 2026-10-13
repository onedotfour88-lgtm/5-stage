# 최부장 비밀 금고 (Choi Bujang Secret Vault)

**현재 진행 단계: 7단계 — 평소와 다른 접속은 다시 확인합니다**

### 이번 단계에서 추가한 내용
- 입력 검사: `signals.source`의 `judge_fixture`(엔진이 전달한 가상 신호), `none`(신호 없음), 불명확한 입력을 구분합니다. 브라우저 헤더·위치는 읽지 않으며 누락값을 정상값으로 채우지 않습니다.
- 판정기: 기존 `device_registered`를 유지하고 `step_up_required`를 추가했습니다. 가상 복합 사건 및 불명확한 입력은 추가 확인을 요청하며, 지역만으로 차단하지 않습니다.
- 자기 점검: 정상·복합·가상 재확인·지역만 다른 사건·위조 헤더·누락 신호를 시험합니다. 실제 재로그인 전 차단과 새 로그인 후 허용은 미실행으로 기록합니다.
- 제출 설정의 단계만 7로 올렸습니다. 기존 자료실 주소·로그인 발급자·허용 경로·원본 API·화면과 XDR 미커밋 작업은 보존합니다.

## 진행 단계 및 현황 기록

### 7단계 저장점 — 평소와 다른 접속은 다시 확인합니다
- 인수 시 마지막 커밋 `9f5fe56`의 6단계 저장점과 README의 6단계 표시가 일치했습니다.
- `src/decider.mjs`의 입력 분류는 가상 신호의 지역(`local`/`foreign`), 네트워크(`usual`/`unusual`), 정수 시각(0~23), 최근 사건 배열(최대 12건 및 숫자 필드)을 검사합니다. 값 누락·형식 오류·불명확한 출처는 `step_up / step_up_required`로 보냅니다.
- 정해진 가상 복합 조건은 **0~5시 또는 23시 + unusual 네트워크 + 최근 120초 안의 risk_signal 합계 20회 이상**입니다. `risk_signal`은 시작 틀의 가상 다량 읽기 표현이며 실제 자료 읽기 로그로 주장하지 않습니다. 지역 하나만으로 영구 차단하지 않습니다.
- 기기 미등록은 먼저 `deny / device_not_registered`입니다. 정상 가상 조합은 `allow / approved`, 복합 조합은 `step_up / step_up_required`입니다. `source:none`은 실제 위치 증거가 없다는 뜻이며 정상 위치로 바꾸지 않고 기존 기기 규칙에 따라 허용합니다.
- 계약의 `stepUp: {verified, authAgeSeconds}`를 통한 재확인 후 허용은 `judge_fixture`에서만 연습합니다. true 및 정수 0~900초일 때만 가상 복합 사건을 다시 허용합니다. 누락·오래된 값·잘못된 타입으로는 추가 확인을 해제하지 않습니다.
- 저장소에는 추가 확인 요청 이후 동일 주체가 새로 로그인했는지 검증하는 실제 엔진 계약·세션 연결이 없습니다. 실제 자료 차단 및 재로그인 후 자료 허용은 **미실행**이며 가상 시험과 구분합니다. 토큰 원문은 수집하거나 기록하지 않습니다.
- 확인 결과: `npm run fixture:7`, `npm run decider:test`, `node --test test/decider-7.test.mjs`를 실제 실행했고 모두 통과했습니다(별도 테스트 5개, 실패 0개).

#### 7단계 확인 순서
1. `npm run fixture:7` — 정상 사건 `allow`, 복합 이상 사건 `step_up`.
2. `npm run decider:test` — 등록 정상·미등록 거부·복합 추가 확인·가상 재확인 후 허용 모두 통과.
3. `node --test test/decider-7.test.mjs` — 입력 누락·위조 헤더·복합 조건 경계·지역 단독·가상 재확인·기기 규칙 보존 검증.
4. `https://5-stage.vercel.app/`의 **로그인** 버튼은 기존 화면 그대로입니다. 실제 재로그인 시험은 동일 주체의 새 로그인 시각을 검증하는 엔진 계약과 등록 기기 세션이 준비된 경우에만 실행합니다. 이번에는 미실행입니다.
5. `7단계 저장점` 커밋 뒤 깨끗한 동일 커밋 체크아웃에서 `npm run bundle`로 제출 JSON을 생성하고 GitHub `main`에 푸시합니다. 제출 파일과 설명 파일은 커밋하지 않습니다. 가상 시험은 심판 판정이 아닙니다.

### 6단계 저장점 — 등록한 기기만 자료실에 들어옵니다
- `src/decider.mjs`의 `device_registered` 규칙은 엔진 요청의 `deviceRegistered === true`일 때 `allow / approved`를 반환합니다. 미등록·누락·잘못된 타입은 `deny / device_not_registered`입니다.
- 사용자 정보는 `request.subjectId`의 검증된 가명 주체 ID입니다. 로그인·기기·동작·경로의 선행 검증은 엔진이 맡으며, 판정기는 요청 계약의 기기 등록 값만 사용합니다.
- 현재 자료실은 Supabase 이메일·비밀번호 로그인, 사용자별 메모 목록·추가(`/api/memos`), 단건 읽기(`/api/notes/:id`), 인증 없는 요청 거부를 구현합니다. 기존 API 주소와 화면은 유지합니다.
- 설정은 6단계, Git origin `https://github.com/onedotfour88-lgtm/5-stage`, 현재 메모 API의 Supabase 발급자(`authenticated` 대상 및 공개 JWKS 주소)로 기록합니다. 기존 허용 경로 `/api/memos`, `/api/notes`와 원본 API `https://igumgbitelfytidliydi.supabase.co/rest/v1/memos`는 보존합니다.
- 인수 시 README는 3단계였으나 마지막 커밋은 `ac99dff`의 `보너스 xdr-02 저장점`이었습니다. 과거 기록의 수정·삭제 및 발급자 설정 완료 문구는 당시 기록이며, 인수한 코드·설정과 일치하지 않습니다. 단건 API의 기본 Supabase 주소도 목록 API와 다르므로 실제 접속 동작은 별도 확인이 필요합니다.

#### 확인 순서
1. 저장소 폴더에서 `npm run decider:test`를 실행합니다. `통과 · 등록 기기의 정상 요청`과 `통과 · 미등록 기기의 가상 요청`이 모두 나와야 합니다. 후자는 `deny / device_not_registered`와 응답 계약을 검증합니다.
2. 누락 및 잘못된 타입도 거부되는지 로컬 가상 요청으로 확인합니다. 이는 심판 판정이나 실제 등록 기기 접속 증거가 아닙니다.
3. 실제 등록 기기에서 기존 배포 주소 `https://5-stage.vercel.app/`를 열고 **로그인**을 누른 뒤 표시되는 본인 메모 목록을 확인합니다. 2026-10-13 브라우저에서 자료실 (5단계) 제목과 로그인·회원가입 화면 표시를 확인했습니다. 등록 기기의 로그인 후 자료 읽기는 미실행입니다. 접속 프로그램 설치는 없으며 미등록 기기 공격은 심판이 맡습니다.
4. 저장점 커밋 후 `npm run bundle`을 실행합니다. `artifacts/submission.json`은 제출용이며 `bundle-notes.json`과 함께 커밋하지 않습니다. 기존 XDR 미커밋 작업을 보존하기 위해 제출 묶음은 같은 저장점의 깨끗한 별도 체크아웃에서 생성할 수 있습니다.

인증서·CA·서명 키·기기 개인키는 생성하거나 Git에 추가하지 않습니다. 공개 로그인 화면 접속만 확인했으며 새 배포·등록 기기 자료 읽기·실제 심판 확인은 실행하지 않았습니다.

### 3단계 진행 현황 (진짜 로그인을 붙입니다)
- **Supabase Auth 연동**: 이메일/비밀번호 기반 로그인/로그아웃 구현
- **인증 토큰 검증**: `src/verify-login.mjs` 검증 규격 준수 및 API 토큰 수신 검증 (`identityProvider` 설정 완료)
- **가상 메모 CRUD API (`/api/memos`)**:
  - `POST /api/memos`: 메모 추가 (`owner_id` 할당, UUID 자동 생성)
  - `GET /api/memos`: 로그인 사용자의 메모 목록 반환 (미인증 시 401 JSON 반환)
  - `GET /api/memos/:id`: 단건 메모 조회 (삭제 후 404)
  - `PUT /api/memos/:id`: 메모 수정
  - `DELETE /api/memos/:id`: 메모 삭제
- **가점 100점 항목 충족**:
  - 무로그인 메모 목록 요청 시 401 JSON 에러 반환
  - 빌드 시 `/aleph.json` 자동 생성 유지 (`scripts/build-public.mjs`)
  - `vercel.json` 내 `X-Content-Type-Options: nosniff` 및 `Content-Security-Policy` 보안 헤더 추가

---

### 이전 단계 기록
- **1~2단계**: XDR 위협 탐지(Detect) 및 대응(Decider) 자동화 구축 완료
