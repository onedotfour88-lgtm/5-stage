const PATTERNS = [
  {
    "name": "SQL Injection Attack Attempt",
    "condition": "SQL query syntax such as SELECT, UNION, INSERT, UPDATE, DELETE, OR 1=1, or DROP in request parameters",
    "rationale": "MITRE ATT&CK T1190: Exploit Public-Facing Application - Injecting SQL commands into input fields to bypass auth or extract data."
  },
  {
    "name": "Cross-Site Scripting (XSS) / Script Injection Attempt",
    "condition": "Script tags or HTML event handlers like <script>, javascript:, or onerror= in input parameters",
    "rationale": "MITRE ATT&CK T1190: Exploit Public-Facing Application - Injecting malicious scripts into web requests to execute on client browsers."
  },
  {
    "name": "Path Traversal Attack Attempt",
    "condition": "Repeated directory traversal sequences like ../ or ..\\ in request paths or parameters",
    "rationale": "MITRE ATT&CK T1190: Exploit Public-Facing Application - Accessing restricted files outside web root using relative directory paths."
  }
];

// 동일 주소(IP)에서 반복되는 주입 공격을 추적하기 위한 메모리 카운터
const ipAttackCounts = new Map();

export function decide(alert) {
  const level = Number(alert?.rule?.level ?? 0);
  const desc = String(alert?.rule?.description || alert?.rule?.comment || '').toLowerCase();
  const groups = Array.isArray(alert?.rule?.groups)
    ? alert.rule.groups.map(g => String(g).toLowerCase())
    : [];
  const fullData = JSON.stringify(alert || {}).toLowerCase();
  
  // 출발 IP 추출
  const srcip = alert?.data?.srcip || alert?.data?.client_ip || alert?.data?.ip || alert?.agent?.ip || 'unknown';

  // 공격 페이로드 판별
  const isSql = desc.includes('sql') || desc.includes('sqli') || fullData.includes('select') || fullData.includes('union') || fullData.includes('or 1=1') || fullData.includes('drop');
  const isXss = desc.includes('xss') || desc.includes('script') || fullData.includes('<script>') || fullData.includes('javascript:') || fullData.includes('onerror=');
  const isPathTraversal = desc.includes('traversal') || desc.includes('directory') || fullData.includes('../') || fullData.includes('..\\');

  const isInjectionAttack = isSql || isXss || isPathTraversal || groups.includes('web_attack') || groups.includes('sql_injection');

  // 대응하는 근거 패턴 이름 선정
  let reason = PATTERNS[0].name;
  if (isXss) reason = PATTERNS[1].name;
  if (isPathTraversal) reason = PATTERNS[2].name;

  if (isInjectionAttack) {
    // 해당 IP의 공격 카운트 증가
    const currentCount = (ipAttackCounts.get(srcip) || 0) + 1;
    ipAttackCounts.set(srcip, currentCount);

    // 1. [block] 같은 주소(IP)에서 2회 이상 반복되거나, 심각도가 높고(level >= 8) 명시적인 공격인 경우
    if (currentCount >= 2 || level >= 8) {
      return {
        action: 'block',
        confidence: 0.90,
        reason
      };
    }

    // 2. [alert] 1회성 단발 주입 시도나 위험도가 중간 정도인 경보
    return {
      action: 'alert',
      confidence: 0.65,
      reason
    };
  }

  // 웹 관련 의심 경보 (level >= 5)
  if (level >= 5 || groups.includes('web') || groups.includes('attack')) {
    return {
      action: 'alert',
      confidence: 0.55,
      reason
    };
  }

  // 3. [record] 정상 요청 (level < 5)
  return {
    action: 'record',
    confidence: 0.10,
    reason: 'Normal web traffic'
  };
}