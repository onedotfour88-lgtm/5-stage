const PATTERNS = [
  {
    "name": "large_unusual_transfer",
    "condition": "Trusted T1041/T1048 level>=10, bytes>=50000000 and unfamiliar destination, repeated transfer, unusual port, off-hours or bulk-copy context",
    "confidence": 0.95,
    "evidence": "T1041 C2 channel / T1048 alternative protocol exfiltration; size threshold is local policy https://attack.mitre.org/techniques/T1041/ https://attack.mitre.org/techniques/T1048/"
  },
  {
    "name": "transfer_review",
    "condition": "Trusted T1041/T1048 level>=5 without corroborated large transfer",
    "confidence": 0.6,
    "evidence": "Review anomalous volume/destination or archive staging without claiming confirmed exfiltration; T1041/T1048"
  }
];
export function decide(alert){
 const rule=alert?.rule??{},data=alert?.data??{};
 const ids=Array.isArray(rule.mitre)?rule.mitre:rule.mitre?.id;
 const tagged=Array.isArray(ids)&&ids.some(x=>typeof x==='string'&&/^(T1041|T1048)(\.|$)/.test(x));
 const level=Number.isFinite(rule.level)?rule.level:0;
 const numeric=v=>typeof v==='number'?v:typeof v==='string'&&/^\d+$/.test(v)?Number(v):NaN;
 const bytes=numeric(data.bytes),count=numeric(data.count);
 const desc=typeof rule.description==='string'?rule.description:'';
 const context=/처음 보는|처음 봅니다|평소에 쓰지 않던 포트|시간 밖|전체.*외부|unfamiliar|off.hours|unusual port/i.test(desc)||count>=3;
 let name=tagged&&level>=5?'transfer_review':null;
 if(tagged&&level>=10&&Number.isSafeInteger(bytes)&&bytes>=50000000
   &&typeof data.dstip==='string'&&data.dstip.length>0&&context
   &&!/전송.*실패|전송.*없|transfer failed/i.test(desc))name='large_unusual_transfer';
 const confidence=PATTERNS.find(p=>p.name===name)?.confidence??0;
 return {action:confidence>=.85?'block':confidence>=.5?'alert':'record',confidence,reason:name??'no_supported_pattern'};
}
