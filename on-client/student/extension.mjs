// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.
export function createStudentView() {
  return {
    renderIdentity({ me, devices, sessions } = {}) {
      // 호출마다 새 DOM을 반환합니다. 제공 UI가 이전 표시 전체를 교체합니다.
      const root = document.createElement('div');
      const add = (parent, tag, text) => {
        const node = document.createElement(tag);
        node.textContent = text;
        parent.append(node);
        return node;
      };
      const value = text => typeof text === 'string' && text.trim() ? text : '확인 불가';
      const deviceStatus = status => {
        switch (status) {
          case 'compliant': return '보안 기준 충족';
          case 'noncompliant': return '보안 기준 미충족';
          default: return '확인 불가';
        }
      };
      const sessionStatus = status => {
        switch (status) {
          case 'active': return '활성';
          case 'expired': return '만료';
          case 'revoked': return '철회됨';
          default: return '확인 불가';
        }
      };
      const fields = (parent, entries) => {
        const list = document.createElement('dl');
        for (const [label, text] of entries) {
          add(list, 'dt', label);
          add(list, 'dd', text);
        }
        parent.append(list);
      };
      const deviceFields = device => [
        ['기기 이름', value(device?.label)],
        ['기기 ID', value(device?.id)],
        ['기기 상태', deviceStatus(device?.status)],
      ];
      const sessionFields = session => [
        ['세션 ID', value(session?.id)],
        ['세션 상태', sessionStatus(session?.status)],
      ];
      const section = (title, resource, renderData) => {
        const box = document.createElement('section');
        add(box, 'h3', title);
        // 모드 안내는 loading/error에서도 생략하지 않습니다.
        switch (resource?.mode) {
          case 'demo': add(box, 'p', '예제 자료'); break;
          case 'disconnected': add(box, 'p', '연결 없음'); break;
          case 'connected': break;
          default: add(box, 'p', '확인 불가');
        }
        switch (resource?.status) {
          case 'loading': add(box, 'p', '불러오는 중'); break;
          case 'error':
            add(box, 'p', `연결 실패: ${value(resource.error?.message)}`);
            break;
          case 'ok': renderData(box, resource.data); break;
          default: add(box, 'p', '상태 확인 불가');
        }
        root.append(box);
      };

      section('현재 사용자·기기·세션', me, (box, data) => {
        fields(box, [
          ['사용자 이름', value(data?.user?.label)],
          ['사용자 ID', value(data?.user?.id)],
          ...deviceFields(data?.device),
          ...sessionFields(data?.session),
        ]);
      });
      section('내 기기 목록', devices, (box, data) => {
        if (!Array.isArray(data)) return add(box, 'p', '기기 목록 확인 불가');
        if (data.length === 0) return add(box, 'p', '표시할 기기가 없습니다.');
        const list = document.createElement('ul');
        for (const device of data) {
          const item = document.createElement('li');
          fields(item, deviceFields(device));
          list.append(item);
        }
        box.append(list);
      });
      section('내 세션 목록', sessions, (box, data) => {
        if (!Array.isArray(data)) return add(box, 'p', '세션 목록 확인 불가');
        if (data.length === 0) return add(box, 'p', '표시할 세션이 없습니다.');
        const list = document.createElement('ul');
        for (const session of data) {
          const item = document.createElement('li');
          fields(item, sessionFields(session));
          list.append(item);
        }
        box.append(list);
      });
      return root;
    },
    renderDecision() { return '학생 구현 대기: 서버의 판정과 이유를 연결하세요.'; },
    renderEvents() { return '학생 구현 대기: 본인 접속·XDR 기록을 연결하세요.'; },
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
