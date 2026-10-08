import fs from 'node:fs';
import path from 'node:path';

const filePath = path.resolve('xdr/fixtures/web-injection.json');
const rawData = fs.readFileSync(filePath, 'utf-8');
const alerts = JSON.parse(rawData);

alerts.forEach((alert) => {
  const timestamp = alert.timestamp || alert['@timestamp'] || alert.data?.timestamp || '';
  const srcip = alert.data?.srcip || alert.data?.client_ip || alert.data?.ip || alert.agent?.ip || '';
  const user = alert.data?.dstuser || alert.data?.user || alert.data?.srcuser || '';
  const level = alert.rule?.level ?? 0;
  const description = alert.rule?.description || alert.rule?.comment || '';

  // 비밀값(비밀번호, 토큰 등) 필드는 완전히 제외하고 지정된 5개 속성만 추출
  const summary = {
    timestamp,
    srcip,
    user,
    level,
    description
  };

  console.log(JSON.stringify(summary));
});