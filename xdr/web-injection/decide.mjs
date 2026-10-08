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

// 동일 IP의 반복 주입 시도를 추적하기 위한 내부 메모리 저장소
const ipAttackCounts = new Map();

export function decide(alert) {
  const level = Number(alert?.rule?.level ?? 0);
  const desc = String(alert?.rule?.description || alert?.rule?.comment || '').toLowerCase();
  const groups = Array.isArray(alert?.rule?.groups)
    ? alert.rule.groups.map(g => String(g).toLowerCase())
    : [];
  const fullData = JSON.stringify(alert || {}).toLowerCase();
  const srcip = alert?.data?.srcip || alert?.data?.client_ip || alert?.data?.ip || alert?.agent?.ip || 'unknown';

  // 1. 공격 신호 탐지 (SQLi, XSS, Path Traversal)
  const isSql = desc.includes('sql') || desc.includes('sqli') || fullData.includes('select') || fullData.includes('union') || fullData.includes('or 1=1') || fullData.includes('drop');
  const isXss = desc.includes('xss') || desc.includes('script') || fullData.includes('<script>') || fullData.includes('javascript:') || fullData.includes('onerror=');
  const isPathTraversal = desc.includes('traversal') || desc.includes('directory') || fullData.includes('../') || fullData.includes('..\\');
  
  const isWebAttack = isSql || isXss || isPathTraversal || groups.includes('web') || groups.includes('web_attack') || groups.includes('sql_injection');

  // 어떤 패턴에 해당하는지 사유 매칭
  let reason = PATTERNS[0].name;
  if (isXss) reason = PATTERNS[1].name;
  if (isPathTraversal) reason = PATTERNS[2].name;

  if (isWebAttack) {
    const currentCount = (ipAttackCounts.get(srcip) || 0) + 1;
    ipAttackCounts.set(srcip, currentCount);

    // 조건 A: 같은 주소에서 반복(2회 이상)되거나 위험도(level >= 10)가 명확한 주입 공격 -> block
    if (currentCount >= 2 || level >= 10) {
      return {
        action: 'block',
        confidence: 0.90,
        reason
      };
    }

    // 조건 B: 반복되지 않은 단발성 주입 시도 및 중간 수준 공격 -> alert
    return {
      action: 'alert',
      confidence: 0.65,
      reason
    };
  }

  // 단순 웹 로그/의심 경보 중 level이 있는 경우 alert 고려
  if (level >= 6) {
    return {
      action: 'alert',
      confidence: 0.55,
      reason: PATTERNS[0].name
    };
  }

  // 정상 요청 -> record
  return {
    action: 'record',
    confidence: 0.10,
    reason: 'Normal web traffic'
  };
}