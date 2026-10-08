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

// 동일 IP의 반복적 주입 시도 카운트 추적 (모듈 실행 동안 유지)
const ipAttackCounts = new Map();

export function decide(alert) {
  const level = Number(alert?.rule?.level ?? 0);
  const desc = String(alert?.rule?.description || alert?.rule?.comment || '').toLowerCase();
  const groups = Array.isArray(alert?.rule?.groups)
    ? alert.rule.groups.map(g => String(g).toLowerCase())
    : [];
  const fullData = JSON.stringify(alert || {}).toLowerCase();

  // 출발지 IP 정확 추출
  const srcip = alert?.data?.srcip || alert?.data?.client_ip || alert?.data?.ip || alert?.srcip || alert?.agent?.ip || '0.0.0.0';

  // 1. 주입 공격 패턴 신호 검사
  const isSql = desc.includes('sql') || desc.includes('sqli') || fullData.includes('select') || fullData.includes('union') || fullData.includes('or 1=1') || fullData.includes('drop');
  const isXss = desc.includes('xss') || desc.includes('script') || fullData.includes('<script>') || fullData.includes('javascript:') || fullData.includes('onerror=');
  const isPathTraversal = desc.includes('traversal') || desc.includes('directory') || fullData.includes('../') || fullData.includes('..\\');

  const isWebAttack = isSql || isXss || isPathTraversal || groups.includes('web_attack') || groups.includes('sql_injection');

  // 대응 매칭 패턴 선정
  let reason = PATTERNS[0].name;
  if (isXss) reason = PATTERNS[1].name;
  if (isPathTraversal) reason = PATTERNS[2].name;

  if (isWebAttack) {
    const count = (ipAttackCounts.get(srcip) || 0) + 1;
    ipAttackCounts.set(srcip, count);

    // [block] 같은 IP에서 반복되는 명확한 주입(2회 이상) 또는 고위험군(level >= 7)
    if (count >= 2 || level >= 7) {
      return {
        action: 'block',
        confidence: 0.90,
        reason
      };
    }

    // [alert] 단발성 주입 시도 (1회차)
    return {
      action: 'alert',
      confidence: 0.65,
      reason
    };
  }

  // 웹 관련 의심 신호 및 중간 레벨 경보
  if (level >= 5 || groups.includes('web')) {
    return {
      action: 'alert',
      confidence: 0.55,
      reason: PATTERNS[0].name
    };
  }

  // [record] 정상 웹 트래픽
  return {
    action: 'record',
    confidence: 0.10,
    reason: 'Normal web traffic'
  };
}