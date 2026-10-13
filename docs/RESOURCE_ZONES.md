# 8단계 자원 구역

메모 자원 ID는 `memo:<기존 자료 ID>`, 공지는 `announcement:<자료 ID>`입니다.
응답에 `resourceId`를 추가하고 `X-Resource-ID` 헤더로 선택된 자원을 표시합니다.
목록 헤더는 `memo:collection`이며 각 행에는 실제 자료 ID가 있습니다.
기존 메모·주소·화면 메뉴는 유지합니다.

## 판정기

`subjectId`는 엔진이 확인한 가명 ID입니다. Supabase 사용자 번호와 직접 비교하지 않습니다.
서버 관리 정책 `ALEPH_RESOURCE_POLICY_JSON`의 자원별 소유 가명 ID, 반·프로젝트,
허용 기기 ID 및 강사 명단과 비교합니다. 요청 본문의 역할/정책은 읽지 않습니다.
기본 `resource-policy.json`은 `class_fixture/project_fixture`의 가상 시험 전용입니다.
시험용 ID 목록을 운영 요청의 필수 조건으로 사용하지 않습니다. 등록된 구역은 정책대로
검사하고, 소유자 연결을 받지 않은 정상 메모 경로는 최종 API의 실제 소유자 검사를 받도록
전달합니다. 이것은 자료 본문을 허용하는 최종 결정이 아닙니다.
관리자가 `ALEPH_RESOURCE_POLICY_JSON`을 명시한 환경은 정책에 없는 자원을 계속 거부합니다.

관리자는 운영 엔진이 검증한 가명 ID와 저장된 소유자 정보를 연결한 뒤 서버 설정에
정책을 넣어야 합니다. 자료 소유자가 바뀌면 엔진 정책도 갱신해야 하며 최종 API는
현재 DB 소유자를 재검증합니다. 실제 사용자 ID·정책·비밀값을 Git/제출 파일에 복사하지 않습니다.

자원 정책 형식은 `resource-policy.json`의 가상 예시를 참고합니다.
`resources` 각 항목: `classId`, `projectId`, `type`, `id`, 메모의 `ownerSubjectId`, `deviceIds`.
`instructors` 각 항목: `classId`, `projectId`, `subjectId`, `deviceIds`.

기존 `device_registered`, `step_up_required` 뒤에 `resource_zones`를 등록했습니다.
미등록 기기는 먼저 거부하고, 구역 권한도 재확인 상태와 무관하게 검사합니다.
GET/PUT/PATCH의 정확한 경로 및 `route`만 허용하며 알 수 없는 경로·메서드는 거부합니다.
엔진의 가상 자원 ID는 opaque 문자열이므로 판정기에서 숫자/UUID만으로 제한하지 않습니다.
메모 목록/추가는 `/api/memos`, `/api/notes`의 GET/POST로 제한합니다. 명시적인 권한 연결이
있는 경우 해당 정책을 검사하고, 연결이 없는 기본 환경에서는 최종 API가 검증한 로그인으로
목록 필터링·소유자 지정을 강제합니다.
판정기에는 쿼리 원문이 없으므로 쿼리에서 기능이나 권한을 추론하지 않습니다.
거부 이유 `resource_forbidden`은 **운영 등록부의 allowedReasonCodes 등록 확인이 필요**합니다.
현재 저장소에는 해당 등록부가 없어 실제 심판에서 허용된 코드라고 주장하지 않습니다.

## 최종 API

- 기존 `/api/memos`, `/api/notes`, `/api/notes/:id`, `/api/memos/:id` 유지.
- 공지 `/api/announcements/:id` 추가. 메모 읽기/수정은 GET/PUT/PATCH.
- 쿼리는 `id`만 허용하며 경로 ID와 다르면 거부합니다. `action`, `role`, `export` 선택은 거부합니다.
- 자료 ID는 기존 양의 정수 또는 UUID만 허용합니다. `export`, 추가 경로, 인코딩된 경로·경로 이동은 거부합니다.
- Supabase `auth.getUser()`로 확인한 사용자만 사용합니다.
- 메모 조회·수정 모두 `owner_id` 조건을 DB 쿼리에 넣고 저장된 소유자를 확인합니다.
- 새 메모의 소유자는 서버에서 지정합니다. 수정은 title/body만 허용하여 소유자 변경을 막습니다.
- 공지 수정은 서버 관리 `resource_roles` 테이블의 `instructor` 권한이 있어야 합니다.
- 공지는 로그인 사용자에게 공개되며 일반 학생은 쓰지 못합니다.
- 토큰·본문을 로그에 남기지 않으며 오류는 짧은 코드만 반환합니다.

`docs/RESOURCE_ZONES.sql`은 추가 테이블과 권한 준비용이며 **운영 DB에 실행하지 않았습니다**.
기존 서비스 전용 키는 배포 설정에서만 사용합니다. 공용 키로 서버 권한을 대체하지 않습니다.
광범위한 notes 재작성을 제거하여 단건 서버 API가 직접 검사합니다. 기존 notes 단건 파일에
있던 별도 Supabase 기본 주소 대신 현재 실제 메모 API의 프로젝트 설정을 사용합니다.
기존 notes URL과 현재 자료실의 원본 API URL은 유지합니다.

## 확인

`npm run decider:test`와 `npm run test:8`을 실행합니다.
가상 엔진 요청과 가짜 DB를 사용한 직접 API 핸들러 시험이며 운영 DB 실측은 아닙니다.
실제 공지 DB·강사 등록·엔진 권한 연결이 준비된 뒤 A/B 계정으로 운영 API를 별도 확인해야 합니다.
기존 화면의 로그인 버튼은 그대로이고 공지 메뉴를 추가하지 않았습니다.
