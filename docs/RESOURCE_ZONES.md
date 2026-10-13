# 8단계 자원 구역

메모 자원 ID는 `memo:<기존 자료 ID>`, 공지는 `announcement:<자료 ID>`입니다.
응답에 `resourceId`를 추가하고 `X-Resource-ID` 헤더로 선택된 자원을 표시합니다.
목록 헤더는 `memo:collection`이며 각 행에는 실제 자료 ID가 있습니다.
기존 메모·주소·화면 메뉴는 유지합니다.

## 판정기

2026-10-13 사용자가 전달한 최신 심판 안내에 맞춰 역할을 분리합니다.
판정기는 엔진이 확인한 사용자·기기·서비스·메서드·정확한 경로를 검사합니다.
가명 subjectId를 DB 사용자 UUID와 비교하거나 이름으로 소유자/강사 권한을 추정하지 않습니다.

- 메모 단건: /notes/:id, /api/notes/:id, /api/memos/:id의 GET/PUT/PATCH만 통과시킵니다.
  자료 ID는 기능 이름이 아닌 단일 경로 조각이어야 하며 route가 method 및 실제 경로와 일치해야 합니다.
  한 건의 실제 소유자는 최종 API가 검증된 로그인과 DB의 owner_id를 비교합니다.
- 메모 전체 목록: GET /notes, /api/notes, /api/memos는 누구에게나 거부합니다.
  쿼리가 붙어도 목록 경로를 열지 않습니다. 기존 메모 생성 POST /api/memos, /api/notes와
  엔진용 POST /notes는 빈 쿼리 및 정확한 route일 때 최종 API로 넘깁니다. 소유자는 API가 지정합니다.
- 공지: 기존 /announcements 및 /api/announcements의 GET만 통과합니다.
  POST/PUT/PATCH/DELETE는 강사, 본문 role, 재확인 상태 및 환경 정책과 무관하게 거부합니다.
  강사 자료와 알 수 없는 다른 경로도 허용 표에 없으므로 거부합니다.
- 단건 경로의 쿼리는 같은 ID를 가리키는 정확한 id=<경로 ID>의 길이·SHA-256만 인정합니다.
  기능 선택·다른 ID·중복 ID·추가 필드·경로 이동·인코딩 경로는 거부합니다.
- 이전 device_registered 및 step_up_required 규칙과 응답 다섯 항목은 유지합니다.
  구역 거부는 기존 starter_not_ready 코드와 resource_zones 규칙 ID로 표시합니다.

판정기의 시험용 소유자/강사 목록과 ALEPH_RESOURCE_POLICY_JSON 의존성을 제거했습니다.
resource-policy.json은 이전 가상 정책 예시로 보존하지만 현재 판정기는 읽지 않습니다.
외부 import·파일 시스템·Node process 없이 단일 소스 격리 실행을 시험합니다.

## 최종 API

### 실제 메모 DB RLS 수정 (2026-10-13)

실제 Supabase Policies 화면에서 `memos`의 전체 허용 정책(`ALL / public`,
USING 및 WITH CHECK가 true)을 확인했습니다. 기존 정책 한 곳을
`auth.uid()::text = owner_id::text`로 수정했고 저장 성공 및 저장된 조건을 재조회했습니다.
동일한 재현 SQL은 `docs/MEMOS_OWNER_POLICY.sql`입니다. 메모 내용·소유자는 변경하지 않습니다.
서버의 service_role은 RLS를 우회하므로 아래 API 소유자 검사도 유지합니다.
실제 A/B 계정 조회 및 심판 재판정은 미실행입니다.

- 기존 `/api/memos`, `/api/notes`, `/api/notes/:id`, `/api/memos/:id` 유지.
- 공지 `/api/announcements/:id` 추가. 메모 읽기/수정은 GET/PUT/PATCH.
- 쿼리는 `id`만 허용하며 경로 ID와 다르면 거부합니다. `action`, `role`, `export` 선택은 거부합니다.
- 자료 ID는 기존 양의 정수 또는 UUID만 허용합니다. `export`, 추가 경로, 인코딩된 경로·경로 이동은 거부합니다.
- Supabase `auth.getUser()`로 확인한 사용자만 사용합니다.
- 메모 조회·수정 모두 `owner_id` 조건을 DB 쿼리에 넣습니다. DB가 반환한 목록의 각 행은 저장된 소유자를 응답 직전에 재대조하고, 단건 읽기·수정은 소유자와 요청 자료 ID를 모두 대조합니다. 생성·수정의 반환 행도 검사하며 소유자 필드는 응답에서 제외합니다.
- 새 메모의 소유자는 서버에서 지정합니다. 수정은 title/body만 허용하여 소유자 변경을 막습니다.
- 판정기는 공지 쓰기를 누구에게나 거부합니다. API의 저장된 강사 권한 검사도 유지하여 직접 우회 요청에서 일반 학생의 쓰기를 막습니다.
- 최종 API는 검증된 로그인 사용자로 DB의 resource_roles를 조회하고 반환된 user_id가 검증된 사용자와 같으며 role이 instructor일 때만 POST/PUT/PATCH를 허용합니다. 본문 role/owner는 권한으로 쓰지 않습니다. 일반 학생은 403 / instructor_required입니다. DELETE는 405로 거부합니다.
- 강사 명단을 브라우저로부터 받지 않습니다. 실제 강사는 관리자가 저장된 권한으로 등록해야 합니다.
- 토큰·본문을 로그에 남기지 않으며 오류는 짧은 코드만 반환합니다.

`docs/RESOURCE_ZONES.sql`은 추가 테이블과 권한 준비용이며 **운영 DB에 실행하지 않았습니다**.
기존 서비스 전용 키는 배포 설정에서만 사용합니다. 공용 키로 서버 권한을 대체하지 않습니다.
광범위한 notes 재작성을 제거하여 단건 서버 API가 직접 검사합니다. 기존 notes 단건 파일에
있던 별도 Supabase 기본 주소 대신 현재 실제 메모 API의 프로젝트 설정을 사용합니다.
기존 notes URL과 현재 자료실의 원본 API URL은 유지합니다.

## 확인

`npm run decider:test`와 `npm run test:8`을 실행합니다.
가상 엔진 요청과 가짜 DB를 사용한 직접 API 핸들러 시험이며 운영 DB 실측은 아닙니다.
실제 공지 DB·엔진 소유권 연결이 준비된 뒤 A/B 계정으로 운영 API를 별도 확인해야 합니다.
공지/강사 테이블과 강사 등록은 아직 운영 DB에 적용하지 않았으므로 실제 강사 수정 실측은 미실행입니다.
기존 화면의 로그인 버튼은 그대로이고 공지 메뉴를 추가하지 않았습니다.
