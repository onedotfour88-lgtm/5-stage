const PATTERNS = [
  {
    "name": "unsigned_service",
    "condition": "T1543, level>=10, explicit unsigned service registration/change",
    "confidence": 0.95,
    "evidence": "MITRE T1543 system process creation/modification https://attack.mitre.org/techniques/T1543/"
  },
  {
    "name": "unfamiliar_task",
    "condition": "T1053, level>=10, executable in Temp and unfamiliar/scheduled task context",
    "confidence": 0.92,
    "evidence": "MITRE T1053 recurring execution through scheduled tasks https://attack.mitre.org/techniques/T1053/"
  },
  {
    "name": "unexpected_autostart",
    "condition": "level>=10, explicit absence from baseline plus Startup executable or service Temp executable",
    "confidence": 0.9,
    "evidence": "Startup folder is T1547.001; service persistence T1543 https://attack.mitre.org/techniques/T1547/001/"
  },
  {
    "name": "persistence_review",
    "condition": "Trusted Wazuh T1543/T1053/T1547.001 alert with level>=5, insufficient strong evidence",
    "confidence": 0.6,
    "evidence": "Review tagged persistence changes without treating unknown signatures as unsigned; local triage policy based on T1543/T1053"
  }
];
export function decide(alert){
 const rule=alert?.rule??{},data=alert?.data??{};
 const ids=Array.isArray(rule.mitre)?rule.mitre:rule.mitre?.id;
 const has=id=>Array.isArray(ids)&&ids.some(x=>typeof x==='string'&&(x===id||x.startsWith(id+'.')));
 const level=Number.isFinite(rule.level)?rule.level:0;
 const desc=typeof rule.description==='string'?rule.description:'';
 const path=typeof data.path==='string'?data.path.replaceAll('\\','/'):'';
 const temp=/\/temp\/[^/]+\.(exe|cmd|bat|ps1)$/i.test(path);
 const startup=/\/startup\/[^/]+\.(exe|lnk|cmd|bat|ps1)$/i.test(path);
 const unknown=/평소 목록에 없는|unknown|unfamiliar|not in baseline/i.test(desc);
 let name=null;
 if(level>=10){
  if(has('T1543')&&/서명 없는|서명이 없|unsigned/i.test(desc)&&/서비스|service/i.test(desc))name='unsigned_service';
  else if(has('T1053')&&temp&&/예약 작업|scheduled task/i.test(desc))name='unfamiliar_task';
  else if((has('T1543')||has('T1547'))&&unknown&&(startup||temp))name='unexpected_autostart';
 }
 if(!name&&level>=5&&(has('T1543')||has('T1053')||has('T1547')))name='persistence_review';
 const confidence=PATTERNS.find(p=>p.name===name)?.confidence??0;
 return {action:confidence>=.85?'block':confidence>=.5?'alert':'record',confidence,reason:name??'no_supported_pattern'};
}
