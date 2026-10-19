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
        ['기기 상태', `${deviceStatus(device?.status)} (${value(device?.status)})`],
      ];
      const sessionFields = session => [
        ['세션 ID', value(session?.id)],
        ['세션 상태', `${sessionStatus(session?.status)} (${value(session?.status)})`],
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
    renderDecision({ status, mode, data, error, appId } = {}) {
      // 새 요청의 표시로 교체하며, loading/error에서는 이전 data를 사용하지 않습니다.
      const root = document.createElement('div');
      const add = (tag, text, parent = root) => {
        const node = document.createElement(tag);
        node.textContent = text;
        parent.append(node);
        return node;
      };
      const value = text => typeof text === 'string' && text.trim() ? text : '확인 불가';
      if (mode === 'demo') add('p', '예제 자료');
      else if (mode === 'disconnected') add('p', '연결 없음');
      else if (mode !== 'connected') add('p', '연결 상태 확인 불가');

      if (status === 'idle') {
        add('p', '앱을 골라 접속을 요청하세요. (idle)');
        return root;
      }
      if (status === 'loading') {
        add('p', `요청한 앱 ID: ${value(appId)}`);
        add('p', '판정 확인 중 (loading)');
        return root;
      }
      if (status === 'error') {
        add('p', `요청한 앱 ID: ${value(appId)}`);
        add('p', `요청 실패 (error): ${value(error?.message)}`);
        add('p', '접근 거부 판정이 아닙니다. 요청에 실패하여 접근 판정을 확인할 수 없습니다.');
        return root;
      }
      if (status !== 'ok') {
        add('p', '요청 상태 확인 불가. 접근 판정을 확인할 수 없습니다.');
        return root;
      }

      let decision;
      switch (data?.decision) {
        case 'allow': decision = '접근 허용 (allow)'; break;
        case 'deny': decision = '접근 거부 (deny)'; break;
        case 'challenge': decision = '추가 인증 또는 확인 필요 (challenge)'; break;
        default: decision = '판정 확인 불가 (unknown)';
      }
      const list = document.createElement('dl');
      for (const [label, text] of [
        ['앱 ID', value(data?.appId ?? appId)],
        ['접근 판정', decision],
        ['판정 이유', value(data?.reason)],
        ['판정 시각', value(data?.checkedAt)],
      ]) {
        add('dt', label, list);
        add('dd', text, list);
      }
      root.append(list);
      if (data?.decision === 'allow') {
        add('p', '정책상 접근 허용이며 실제 앱 접속 성공을 보장하지 않습니다.');
      } else if (data?.decision === 'challenge') {
        add('p', '추가 인증 또는 확인이 필요합니다. 이 앱이 확인 절차를 대신 수행하지 않습니다.');
      }
      return root;
    },
    renderEvents({ status, mode, data, error } = {}) {
      // 필터와 상세 선택은 이번 입력의 DOM 안에만 둡니다. 재호출 시 모두 초기화됩니다.
      const root = document.createElement('div');
      const add = (parent, tag, text) => {
        const node = document.createElement(tag);
        node.textContent = text;
        parent.append(node);
        return node;
      };
      const value = text => typeof text === 'string' && text.trim() ? text : '확인 불가';
      const appLabel = appId => typeof appId === 'string' && appId.trim() ? appId : '앱 확인 불가';
      const kindLabel = kind => kind === 'access' ? '접속 기록 (access)'
        : kind === 'xdr' ? 'XDR 경보 (xdr)' : `종류 확인 불가 (${value(kind)})`;
      const stateLabel = (kind, code) => {
        const labels = {
          access: { allowed: '접근 허용', denied: '접근 거부', unknown: '확인 불가' },
          session: { active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가' },
          device: { compliant: '보안 기준 충족', noncompliant: '보안 기준 미충족', unknown: '확인 불가' },
        };
        const label = Object.hasOwn(labels[kind], code) ? labels[kind][code] : '확인 불가';
        return `${label}(${value(code)})`;
      };
      const fields = (parent, entries) => {
        const list = document.createElement('dl');
        for (const [label, text] of entries) {
          add(list, 'dt', label);
          add(list, 'dd', text);
        }
        parent.append(list);
      };
      add(root, 'p', '본인의 최근 보안 기록 최대 40건입니다. 전체 직원 이력이 아니며, XDR은 서버에 저장된 경보입니다. 이 화면에서 새로 탐지하지 않습니다.');
      if (mode === 'demo') add(root, 'p', '예제 자료');
      else if (mode === 'disconnected') add(root, 'p', '연결 없음');
      else if (mode !== 'connected') add(root, 'p', '연결 상태 확인 불가');
      if (status === 'loading') {
        add(root, 'p', '기록을 불러오는 중');
        return root;
      }
      if (status === 'error') {
        add(root, 'p', `기록을 불러오지 못했습니다: ${value(error?.message)}`);
        if (error?.code === 'CONTRACT_MISMATCH') add(root, 'p', '응답 형식 확인 불가 (CONTRACT_MISMATCH)');
        return root;
      }
      if (status !== 'ok' || !Array.isArray(data)) {
        add(root, 'p', '기록 확인 불가: 기록 배열을 확인할 수 없습니다.');
        return root;
      }

      // 원본 배열과 기록을 변경하지 않고 시각을 비교합니다(시간대 오프셋도 반영).
      const events = [...data].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
      const filters = document.createElement('div');
      root.append(filters);
      const makeFilter = (name, getValue, describe) => {
        const label = add(filters, 'label', name);
        const select = document.createElement('select');
        select.setAttribute('aria-label', name);
        const all = add(select, 'option', '전체');
        all.value = 'all';
        const values = [...new Set(events.map(getValue))];
        for (const code of values) {
          if (typeof code !== 'string' || !code.trim() || code === 'all') continue;
          const option = add(select, 'option', describe(code));
          option.value = code;
        }
        select.value = 'all';
        label.append(select);
        return select;
      };
      const kindFilter = makeFilter('기록 종류', event => event.kind, kindLabel);
      const appFilter = makeFilter('업무 앱', event => event.appId, appLabel);
      const accessFilter = makeFilter('접속 상태', event => event.state.access, code => stateLabel('access', code));
      const count = add(root, 'p', '');
      count.setAttribute('aria-live', 'polite');
      const rows = document.createElement('ul');
      root.append(rows);
      const empty = add(root, 'p', '');
      const detail = document.createElement('div');
      root.append(detail);

      const showDetail = event => {
        const box = document.createElement('section');
        box.setAttribute('data-student-event-detail', event.id);
        add(box, 'h3', `${event.id} 상세`);
        fields(box, [
          ['사건 ID', value(event.id)], ['앱 ID', appLabel(event.appId)],
          ['접속 상태', stateLabel('access', event.state.access)],
          ['세션 상태', stateLabel('session', event.state.session)],
          ['기기 상태', stateLabel('device', event.state.device)],
        ]);
        for (const [title, items] of [['근거', event.evidence], ['규칙', event.rules]]) {
          add(box, 'h4', title);
          if (items.length === 0) add(box, 'p', `표시할 ${title} 항목이 없습니다.`);
          const list = document.createElement('ul');
          for (const item of items) {
            const row = document.createElement('li');
            fields(row, [['ID', value(item.id)], ['내용', value(item.text)]]);
            list.append(row);
          }
          box.append(list);
        }
        // 16단계: 전달된 미연결 조치만 안내합니다. 실행 핸들러와 요청은 없습니다.
        if (Array.isArray(event.supportedActions) && event.supportedActions.length > 0) {
          add(box, 'h4', '미지원 조치');
          add(box, 'p', '조치 실행 연결은 준비 중입니다. 아직 지원하지 않으며 요청을 보내지 않습니다.');
          for (const action of event.supportedActions) {
            const button = add(box, 'button', `${action} 미지원`);
            button.type = 'button';
            button.disabled = true;
          }
        }
        detail.replaceChildren(box);
      };
      const renderRows = () => {
        detail.replaceChildren();
        const visible = events.filter(event =>
          (kindFilter.value === 'all' || event.kind === kindFilter.value)
          && (appFilter.value === 'all' || event.appId === appFilter.value)
          && (accessFilter.value === 'all' || event.state.access === accessFilter.value));
        count.textContent = `받은 기록 ${events.length}건 중 ${visible.length}건 표시`;
        rows.replaceChildren();
        empty.textContent = visible.length === 0 ? '표시할 기록이 없습니다' : '';
        for (const event of visible) {
          const row = document.createElement('li');
          row.setAttribute('data-student-event-id', event.id);
          fields(row, [
            ['사건 ID', value(event.id)], ['시각', value(event.at)],
            ['종류', kindLabel(event.kind)], ['앱 ID', appLabel(event.appId)],
            ['요약', value(event.summary)],
          ]);
          const button = add(row, 'button', `${event.id} 상세`);
          button.type = 'button';
          button.addEventListener('click', () => showDetail(event));
          rows.append(row);
        }
      };
      for (const select of [kindFilter, appFilter, accessFilter]) select.addEventListener('change', renderRows);
      renderRows();
      return root;
    },
    renderStatus({ devices, sessions, notifications, diagnostics, mode } = {}) {
      const root = document.createElement('div');
      const add = (parent, tag, text) => {
        const node = document.createElement(tag);
        node.textContent = text;
        parent.append(node);
        return node;
      };
      // 객체 전체나 임의 설정을 문자열로 출력하지 않습니다.
      const safeText = text => {
        if (typeof text !== 'string' || !text.trim()) return '확인 불가';
        if (/\bBearer\s+\S+|-----BEGIN [A-Z ]*PRIVATE KEY-----|\beyJ[\w-]+\.[\w-]+\.[\w-]+|\b(?:sk-|sb_secret_|ghp_|github_pat_)[\w-]+|(?:password|passwd|token|secret|api[_ -]?key|authorization|비밀번호|토큰)\s*[:=]\s*\S+/i.test(text)) {
          return '[비공개 값 제외]';
        }
        return text;
      };
      const modeNote = (box, current) => {
        if (current === 'demo') add(box, 'p', '예제 자료');
        else if (current === 'disconnected') add(box, 'p', '연결 없음');
        else if (current !== 'connected') add(box, 'p', '연결 상태 확인 불가');
      };
      const fields = (parent, entries) => {
        const list = document.createElement('dl');
        for (const [label, text] of entries) {
          add(list, 'dt', label);
          add(list, 'dd', text);
        }
        parent.append(list);
      };
      const failure = (box, name, resource, isDiagnostics = false) => {
        const timedOut = /timeout|timed_out/i.test(resource.error?.code ?? '')
          || /시간.*초과|timed?\s*out|timeout/i.test(resource.error?.message ?? '');
        add(box, 'p', `${name}를 불러오지 못했습니다${timedOut ? ' (시간 초과)' : ''}: ${safeText(resource.error?.message)}`);
        add(box, 'p', `오류 코드: ${safeText(resource.error?.code)}`);
        add(box, 'p', '다시 시도는 위쪽 다시 불러오기 버튼을 직접 누르세요. 자동으로 다시 요청하지 않습니다.');
        if (isDiagnostics) add(box, 'p', '도움정보 재조회는 제공 도움정보 영역의 도움정보 불러오기 버튼을 직접 누르세요.');
      };
      modeNote(root, mode);
      add(root, 'p', '기기는 본인 이름으로 등록되고 회수되지 않은 기기 최대 100개입니다. 세션은 현재 검증된 연결 하나이며 과거 세션 전체 목록이 아닙니다.');
      for (const [name, resource, kind, empty] of [
        ['기기 정보', devices, 'device', '등록된 기기가 없습니다.'],
        ['세션 정보', sessions, 'session', '현재 연결이 없습니다.'],
      ]) {
        const box = document.createElement('section');
        add(box, 'h3', name);
        modeNote(box, resource?.mode);
        if (resource?.status === 'loading') add(box, 'p', `${name}를 불러오는 중`);
        else if (resource?.status === 'error') failure(box, name, resource);
        else if (resource?.status === 'ok' && Array.isArray(resource.data)) {
          if (resource.data.length === 0) add(box, 'p', empty);
          const list = document.createElement('ul');
          for (const item of resource.data) {
            const labels = kind === 'device'
              ? { compliant: '보안 기준 충족', noncompliant: '보안 기준 미충족', unknown: '확인 불가' }
              : { active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가' };
            const meaning = Object.hasOwn(labels, item?.status) ? labels[item.status] : '확인 불가';
            const row = document.createElement('li');
            fields(row, [
              ...(kind === 'device' ? [['기기 이름', safeText(item?.label)]] : []),
              [kind === 'device' ? '기기 ID' : '세션 ID', safeText(item?.id)],
              ['상태', `${meaning}(${safeText(item?.status)})`],
            ]);
            list.append(row);
          }
          box.append(list);
        } else add(box, 'p', `${name} 확인 불가. 위쪽 다시 불러오기 버튼을 직접 누르세요.`);
        root.append(box);
      }

      const notices = document.createElement('section');
      add(notices, 'h3', '알림');
      if (!Array.isArray(notifications)) add(notices, 'p', '알림 확인 불가');
      else if (notifications.length === 0) add(notices, 'p', '주의할 알림이 없습니다.');
      else {
        const list = document.createElement('ul');
        for (const notice of notifications) {
          const row = document.createElement('li');
          fields(row, [['자료(resource)', safeText(notice?.resource)], ['코드(code)', safeText(notice?.code)], ['내용(message)', safeText(notice?.message)]]);
          list.append(row);
        }
        notices.append(list);
      }
      root.append(notices);

      const help = document.createElement('section');
      add(help, 'h3', '학생 도움정보');
      modeNote(help, diagnostics?.mode);
      let copyText = '';
      if (diagnostics?.status === 'loading') add(help, 'p', '도움정보를 불러오는 중');
      else if (diagnostics?.status === 'error') failure(help, '도움정보', diagnostics, true);
      else if (diagnostics?.status === 'idle') add(help, 'p', '도움정보 조회 전입니다. 제공 도움정보 영역의 도움정보 불러오기 버튼을 직접 누르세요.');
      else if (diagnostics?.status === 'ok') {
        const data = diagnostics.data;
        if (data === null || data === undefined || (Array.isArray(data) && data.length === 0)
          || (typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length === 0)) {
          add(help, 'p', '표시할 도움정보가 없습니다.');
        } else if (typeof data !== 'object' || Array.isArray(data)) add(help, 'p', '도움정보 형식 확인 불가');
        else {
          // 허용된 여섯 필드만 새 객체에 복사합니다. 원본·추가 필드·오류는 복사하지 않습니다.
          const safe = {
            requestId: safeText(data.requestId), component: safeText(data.component),
            version: safeText(data.version), checkedAt: safeText(data.checkedAt),
            engine: { mode: safeText(data.engine?.mode), code: safeText(data.engine?.code) },
          };
          fields(help, [
            ['requestId', safe.requestId], ['component', safe.component], ['version', safe.version],
            ['checkedAt', safe.checkedAt], ['engine.mode', safe.engine.mode], ['engine.code', safe.engine.code],
          ]);
          copyText = JSON.stringify(safe, null, 2);
        }
      } else add(help, 'p', '도움정보 상태 확인 불가');
      add(help, 'p', '도움 요청에 사용할 위 여섯 값만 복사합니다. 도움정보 복사 버튼을 직접 누를 때만 클립보드에 기록합니다.');
      const copy = add(help, 'button', '도움정보 복사');
      copy.type = 'button';
      copy.disabled = !copyText;
      const feedback = add(help, 'p', '');
      feedback.setAttribute('aria-live', 'polite');
      copy.addEventListener('click', async () => {
        if (!copyText || copy.disabled) return;
        copy.disabled = true;
        try {
          await navigator.clipboard.writeText(copyText);
          feedback.textContent = '도움정보를 복사했습니다.';
        } catch {
          feedback.textContent = '도움정보를 복사하지 못했습니다. 브라우저의 클립보드 권한을 확인한 뒤 버튼을 직접 다시 누르세요.';
        } finally { copy.disabled = false; }
      });
      root.append(help);
      return root;
    },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
