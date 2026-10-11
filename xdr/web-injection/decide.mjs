const PATTERNS = [
  { name: 'sql-injection', condition: '요청 인자의 SQL 결합 구문 또는 Wazuh SQL 주입 표기', evidence: 'T1190: 공개 앱의 SQL 주입 악용 사례; 시험 경보의 SQL 구문 및 조회 결합 표기.', payload: '\\bunion\\s+(?:all\\s+)?select\\b|\\bselect\\s+.+?\\s+from\\b|[\u0027\u0022]\\s*(?:or|and)\\s+[^&]+=', description: 'SQL.*(?:구문|표식)|데이터베이스 조회를 이어' },
  { name: 'script-injection', condition: '요청 인자의 script 태그 또는 Wazuh 스크립트 삽입 표기', evidence: 'T1190의 공개 웹 앱 악용 범주에 대한 로컬 신호: 시험 경보의 반복 스크립트 삽입 표기; 태그만으로 취약점 악용 성공을 단정하지 않음.', payload: '<\\s*script\\b', description: '스크립트.*(?:삽입|표식)' },
  { name: 'path-traversal', condition: '요청 인자의 ../ 반복 또는 Wazuh 경로 이탈 표기', evidence: 'T1190: 공개 앱 디렉터리 순회 악용 사례; 시험 경보의 여러 단계 경로 이탈 표기.', payload: '(?:\\.\\.[/\\\\]){2,}', description: '경로.*(?:거슬러|이탈)' },
  { name: 'command-injection', condition: 'Wazuh가 명령 구분자 삽입을 보고하거나 요청 인자에 구분자와 명령이 함께 있음', evidence: 'T1190: 공개 앱 명령 주입 악용 사례; 시험 경보의 연속 명령 구분자 표기.', payload: '(?:;|\\|\\||&&)\\s*(?:cat|whoami|curl|wget|id)\\b', description: '명령 구분자 표기' }
];

export function decide(alert) {
  const description = typeof alert?.rule?.description === 'string' ? alert.rule.description : '';
  const url = typeof alert?.data?.url === 'string' ? alert.data.url : '';
  let query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
  for (let i = 0; i < 2; i++) {
    try { query = decodeURIComponent(query.replace(/\+/g, ' ')); } catch { break; }
  }
  const matches = PATTERNS.filter(p => new RegExp(p.payload, 'i').test(query)
    || new RegExp(p.description, 'i').test(description));
  const count = Number(alert?.data?.count ?? 1);
  const level = Number(alert?.rule?.level ?? 0);
  let confidence = 0.1;
  let reason = 'no-injection-pattern';
  if (matches.length) {
    confidence = 0.7;
    if (Number.isFinite(count) && count >= 8 && level >= 10) confidence = 0.95;
    reason = matches.map(p => p.name).join(', ');
  } else {
    const mitre = alert?.rule?.mitre;
    const t1190 = Array.isArray(mitre) && mitre.some(x => x === 'T1190' || x?.id === 'T1190');
    // A weak Wazuh T1190 observation remains an alert, even when no payload
    // pattern is strong enough to justify blocking. Level alone never blocks.
    if (t1190 && level >= 5) {
      confidence = 0.55;
      reason = 'T1190-ambiguous-observation';
    }
  }
  return { action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record', confidence, reason };
}
