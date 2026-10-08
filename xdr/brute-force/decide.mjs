const PATTERNS = [
  {
    "name": "Multiple Failed Logins from Single Source IP",
    "condition": "Short time frame with high volume of login failures from the same source IP address",
    "rationale": "MITRE ATT&CK T1110: Password Guessing / Brute Force - Repeated login failures from a single source indicate automated credential guessing against account interfaces."
  },
  {
    "name": "Password Spray Attack Across Multiple Accounts",
    "condition": "Same password attempted against multiple distinct user accounts from single or distributed IPs",
    "rationale": "MITRE ATT&CK T1110.003: Password Spraying - High ratio of unique accounts to failure attempts within a short window indicates a password spray campaign."
  }
];

export function decide(alert) {
  const level = Number(alert?.rule?.level ?? 0);
  const desc = String(alert?.rule?.description || alert?.rule?.comment || '').toLowerCase();
  const groups = Array.isArray(alert?.rule?.groups)
    ? alert.rule.groups.map(g => String(g).toLowerCase())
    : [];

  // 키워드 및 그룹 매칭
  const isBruteGroup = groups.includes('bruteforce') || groups.includes('brute_force');
  const isAuthFailGroup = groups.includes('authentication_failed') || groups.includes('authentication_failures') || groups.includes('invalid_login');
  
  const hasBruteKeyword = desc.includes('brute force') || desc.includes('bruteforce') || desc.includes('maximum authentication attempts') || desc.includes('multiple failed');
  const hasFailKeyword = desc.includes('failed') || desc.includes('failure') || desc.includes('invalid user');
  const isSprayKeyword = desc.includes('spray') || desc.includes('multiple accounts');

  // 1. [block] 명확한 공격 (confidence >= 0.85)
  // - 레벨 8 이상 + Brute Force 그룹/문구 또는 반복 실패
  // - 레벨 10 이상의 심각한 인증 관련 공격
  if (isBruteGroup || hasBruteKeyword || (isAuthFailGroup && level >= 8) || level >= 10) {
    return {
      action: 'block',
      confidence: 0.90,
      reason: isSprayKeyword ? PATTERNS[1].name : PATTERNS[0].name
    };
  }

  // 2. [alert] 애매한 시도 (0.5 <= confidence < 0.85)
  // - 레벨 5~7 사이의 단발성 실패 / SSHD, PAM, 일반 로그인 실패 경보
  if (isAuthFailGroup || hasFailKeyword || level >= 5 || groups.includes('pam') || groups.includes('sshd')) {
    return {
      action: 'alert',
      confidence: 0.65,
      reason: PATTERNS[0].name
    };
  }

  // 3. [record] 정상 이벤트 (confidence < 0.5)
  // - 레벨 5 미만의 일반 성공/기록 로그
  return {
    action: 'record',
    confidence: 0.10,
    reason: 'Normal authentication event'
  };
}