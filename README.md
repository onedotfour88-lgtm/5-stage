# 최부장 비밀 금고 (Choi Bujang Secret Vault)

**현재 진행 단계: 6단계 — 등록한 기기만 자료실에 들어옵니다**

### 이번 단계에서 추가한 내용
- 판정기: `RULE_IDS`에 `device_registered`를 등록하고, 기기 등록 값이 정확히 `true`인 요청만 허용합니다. 미등록·누락·잘못된 타입은 `deny / device_not_registered`로 거부합니다.
- 자기 점검: 등록·미등록·등록 값 누락 가상 요청의 실제 판정 결과와 기존 배포 주소의 공개 로그인 화면 점검을 추가했습니다. 등록 기기의 로그인 후 자료 읽기는 미실행으로 표시합니다.
- 제출 설정: 단계 번호 6, GitHub 저장소 주소, 배포 주소, 현재 Supabase 로그인 발급자의 공개 정보를 기록했습니다.
- 확인 결과: `npm run decider:test`의 등록·미등록 요청 모두 통과했고, 누락·잘못된 타입의 거부와 공개 로그인 화면 HTTP 200을 확인했습니다. 기존 화면과 API 주소, 다른 XDR 작업은 보존했습니다.

## 진행 단계 및 현황 기록

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
