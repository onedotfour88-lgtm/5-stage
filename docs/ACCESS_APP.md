# 11단계 접속 앱과 승인 연결

현재 자료실 주소와 메모/공지 경로, 판정기 규칙을 유지합니다. manifest 이름은 ‘나만의 자료실’이며 홈 화면 설치가 기기 승인을 뜻하지 않습니다. 설치 안내는 브라우저가 제공할 때 표시합니다. 별도 접속 프로그램은 없습니다.

## 현재 범위와 연결 필요 사항

저장소 및 사용자가 제공한 자료에는 실제 승인 API 계약이 없습니다. 아래는 이 프로젝트의 **연결 어댑터 계약**이며 운영 엔진의 기존 계약이라고 주장하지 않습니다. 운영 측이 이 계약에 맞는 신원·기기 검증을 제공하거나 어댑터를 공식 계약에 맞춰 연결해야 합니다. 현재 실제 서비스 연결·기기 등록 시험은 미실행입니다. 연결이 없으면 보호 자료 API는 503 approval_service_unavailable로 중단합니다. 이전 주소가 유지되어도 승인 미연결 상태에서 자료를 열 수는 없습니다.

Vercel 서버 환경에 DEVICE_APPROVAL_ORIGIN을 승인 엔진의 HTTPS origin으로 설정합니다. 비밀값을 코드에 넣지 않습니다. 임의 서버나 같은 계정이라는 이유만으로 승인하는 서버를 연결하면 안 됩니다. 엔진은 사용자 인증, 실제 기기 증명, 등록 상태, 현재 접속 판정을 매 요청 확인해야 합니다.

| 학생 앱 경로 | 엔진 경로 | 동작 |
|---|---|---|
| GET /api/device/status | GET /device/status | Supabase가 검증한 로그인과 엔진 세션에 묶인 기기의 최신 상태 조회 |
| POST /api/device/requests | POST /device/requests | 동일 출처 요청만 접수; 빈 객체만 전달; 권한을 변경하거나 승인하지 않음 |

엔진에 Authorization과 엔진 전용 __Host-aleph-device-session 쿠키 하나만 전달합니다. 브라우저의 deviceId, role, 승인 헤더·본문·설치 상태는 전달하거나 신뢰하지 않습니다. 세션 쿠키는 기기를 검증하는 엔진이 발급한 불투명한 세션 참조이며 기기 개인키가 아닙니다. 엔진이 기기 증명과 사용자에 묶인 세션을 확인해야 하며 쿠키 문자열만 있으면 승인하는 구현은 계약 위반입니다.

엔진 JSON은 userId(검증한 Supabase 사용자), deviceId(소문자 16진수 16자리), status(pending/approved/denied/revoked), deviceRegistered(boolean), decision(allow/deny/step_up)입니다. 사용자 불일치·형식 오류·오류 상태·시간 초과·리다이렉트는 중단합니다. 기기 세션이 있고 status=approved, deviceRegistered=true, decision=allow일 때만 상태 조회와 자료 API가 허용합니다. 승인 요청 응답은 approved여도 pending으로 표시하며 반드시 상태를 다시 조회합니다.

엔진이 요청 접수 시 새 세션을 발급할 경우 Set-Cookie는 아래 형식 한 개만 허용합니다. 실제 세션 값은 문서나 Git에 넣지 않습니다.

    __Host-aleph-device-session=<engine-generated-opaque-reference>; Path=/; Secure; HttpOnly; SameSite=Strict

앱 JavaScript는 쿠키를 읽지 않습니다. 토큰은 Supabase persistSession=false로 메모리에서만 사용하고 localStorage/sessionStorage/IndexedDB에 저장하지 않습니다. 새로고침 후 다시 로그인해야 합니다. 엔진 세션 쿠키는 만료 시점을 별도로 넣지 않는 세션 쿠키이며 JSON·로그에 출력하지 않습니다. 기기 키를 생성하거나 브라우저에 저장하지 않습니다.

자료 API는 매 요청 기기를 재검증한 후 기존 소유권/저장된 강사 권한 검사를 수행합니다. 기존 판정기의 등록·추가 확인·구역 규칙은 변경하지 않습니다. 화면만 가리는 것으로 API 권한을 대체하지 않습니다. 원본 Supabase 정책은 변경하지 않았으며 실제 원본 API 우회 시험은 미실행입니다.

## 직접 확인 순서

1. npm run test:11 — 가상 승인 엔진/인증/DB와 화면 대역으로 승인 전 무자료·요청만으로 미승인·정상 승인·회수·위조 및 직접 API 차단을 확인합니다.
2. npm run test:8 && npm run decider:test — 승인된 기기 대역에서 자기 메모 허용, 타인 메모 거부, 공지 쓰기·목록·미등록 기기 거부를 확인합니다.
3. 화면에서 로그인 → ‘기기 승인 요청’ → ‘승인 결과 확인’. 엔진 미연결은 ‘승인 서비스 연결이 필요합니다’와 빈 자료 화면이 정상입니다. 요청 버튼만으로 자료가 열리면 안 됩니다.
4. 실제 엔진 연결 뒤 승인된 기기에서 기존 메모 읽기/작성, 승인 대기·회수된 기기의 직접 API 403을 확인합니다. 실제 기기 시험은 미실행입니다.
5. 브라우저 설치 메뉴 또는 ‘홈 화면에 설치’를 사용합니다. 설치 가능 여부는 브라우저마다 다릅니다. 설치 여부로 승인 상태를 변경하지 않습니다.
6. 네트워크를 끄면 현재 자료를 지우고 잠급니다. 새 오프라인 방문은 안내만 표시합니다. 로그인 화면·자료·API·토큰은 서비스 워커 캐시에 넣지 않고 공개 offline.html만 저장합니다. 실제 브라우저 설치·오프라인 시험은 미실행입니다.

참고: [Supabase 초기화 옵션](https://supabase.com/docs/reference/javascript/initializing), [MDN 서비스 워커](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).
