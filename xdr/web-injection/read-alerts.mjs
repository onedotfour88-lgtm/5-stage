import fs from 'node:fs';
import path from 'node:path';

const filePath = path.resolve('xdr/fixtures/web-injection.json');
const rawData = fs.readFileSync(filePath, 'utf-8');
const parsed = JSON.parse(rawData);

// 단일 객체나 nested 구조에 대비해 배열로 정규화
const alerts = Array.isArray(parsed)
  ? parsed
  : (parsed.alerts || parsed.items || [parsed]);

alerts.forEach((alert) => {
  const timestamp = alert.timestamp || alert['@timestamp'] || alert.data?.timestamp || alert.data?.time || '';
  const srcip = alert.data?.srcip || alert.data?.client_ip || alert.data?.ip || alert.agent?.ip || '';
  const user = alert.data?.dstuser || alert.data?.user || alert.data?.srcuser || '';
  const level = alert.rule?.level ?? 0;
  const description = alert.rule?.description || alert.rule?.comment || '';

  // 민감 정보(비밀값 등)는 완전히 제외하고 필요한 5가지 항목만 추출
  const summary = {
    timestamp,
    srcip,
    user,
    level,
    description
  };

  console.log(JSON.stringify(summary));
});