import fs from 'node:fs';
import path from 'node:path';

export function handleResponse(alert, decision) {
  const logPath = path.resolve('xdr/alerts.log');
  const alertId = alert?.id || alert?._id || 'unknown';
  const srcip = alert?.data?.srcip || alert?.data?.client_ip || alert?.data?.ip || alert?.agent?.ip;

  // 1. xdr/alerts.log 에 알림 기록 (한 줄씩 쌓음)
  const logLine = `[${new Date().toISOString()}] [${decision.action.toUpperCase()}] IP:${srcip || 'N/A'} AlertID:${alertId} Reason:${decision.reason}\n`;
  fs.appendFileSync(logPath, logLine, 'utf-8');

  // 2. 명확한 공격(block) 후보만 ZTNA 거부 규칙(aleph.config.json)에 추가
  // - 정상 사용자를 막지 않도록 decision.action === 'block' 조건일 때만 반영
  if (decision.action === 'block' && srcip) {
    const configPath = path.resolve('aleph.config.json');

    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        config.ztnaRules = config.ztnaRules || [];

        // 동일 IP 중복 등록 방지
        const isAlreadyBlocked = config.ztnaRules.some(rule => rule.ip === srcip);
        if (!isAlreadyBlocked) {
          // 만료 시각(24시간 뒤) 및 근거 경보 번호(refAlertId) 첨부
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          
          config.ztnaRules.push({
            ip: srcip,
            action: 'DENY',
            expiresAt: expiresAt,
            refAlertId: alertId,
            reason: decision.reason
          });

          fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
        }
      } catch (err) {
        // 읽기/쓰기 중 오류 발생 시 기존 상태 유지
      }
    }
  }
}