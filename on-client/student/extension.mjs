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
    renderVulnerabilities({ status, mode, data, error } = {}) {
      const root = document.createElement('section');
      const add = (parent, tag, text) => {
        const node = document.createElement(tag);
        node.textContent = text;
        parent.append(node);
        return node;
      };
      const safe = value => typeof value === 'string' && value.trim() && value.length <= 300
        && !/Bearer\s+|-----BEGIN|\beyJ[\w-]+\.|\b(?:sk-|sb_secret_|ghp_|github_pat_)[\w-]+|(?:password|token|secret|api[_ -]?key|authorization|비밀번호|토큰)\s*[:=]/i.test(value)
        ? value : '확인 불가';
      // 정확한 설치 버전만 인정합니다. ^1.2.0 같은 범위·태그는 표시하지 않습니다.
      const exactVersion = value => typeof value === 'string'
        && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value);
      const validName = value => typeof value === 'string' && /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(value);
      const iso = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : '확인 불가';
      const scanText = {
        complete: '모두 조회(complete)',
        partial: '일부 조회 실패(partial) · 받은 결과만 유지하며 나머지는 확인하지 못했습니다.',
        not_checked: '아직 조회 안 함(not_checked) · 승인된 공개 조회 대상 패키지가 없어 조회하지 않았습니다.',
        not_configured: '조회 준비 미완료(not_configured) · 조회 대상 프로젝트 설정이 필요합니다. 대상과 허용 패키지는 운영자가 준비합니다.',
        unverifiable: 'lock 파일 확인 불가(unverifiable) · 설치 버전을 확인하지 못해 조회하지 않았습니다.',
      };
      const packageText = {
        known_vulnerabilities: '알려진 항목 있음(known_vulnerabilities)',
        none_found: '조회 범위에서 알려진 항목 없음(none_found) · 안전하다는 보장이 아닙니다.',
        unverifiable: '조회 확인 불가(unverifiable) · 취약점이 없다는 뜻이 아닙니다.',
      };
      if (mode === 'demo') add(root, 'p', '예제 자료(demo) · 실제 조회 결과가 아닙니다.');
      else if (mode === 'disconnected') add(root, 'p', '연결 없음');
      // idle·loading·error에서는 data를 읽지 않으므로 이전 표가 남지 않습니다.
      if (status === 'idle') { add(root, 'p', '조회 전'); return root; }
      if (status === 'loading') { add(root, 'p', '조회 중 · 아직 결과가 없습니다.'); return root; }
      if (status === 'error') {
        add(root, 'p', `조회 실패: ${safe(error?.message)} · 코드: ${safe(error?.code)}`);
        add(root, 'p', '이전 조회 결과는 현재 확인 결과가 아닙니다. 취약점이 없다는 뜻도 아닙니다. 제공 화면의 조회 버튼을 직접 눌러 다시 조회하세요.');
        return root;
      }
      if (status !== 'ok' || !data || typeof data !== 'object' || !Object.hasOwn(scanText, data.status)) {
        add(root, 'p', '패키지 조회 결과 확인 불가 · 취약점이 없다는 뜻이 아닙니다.');
        return root;
      }
      const packages = Array.isArray(data.packages) ? data.packages : [];
      const inconsistent = data.status === 'complete' && packages.some(pkg => pkg?.status === 'unverifiable');
      add(root, 'p', `전체 조회 상태: ${scanText[data.status]}`);
      if (inconsistent) add(root, 'p', '모두 조회(complete)라고 했지만 확인 불가 패키지가 있어 전체 결과를 신뢰할 수 없습니다.');
      add(root, 'p', '이 결과는 package-lock.json과 설치된 node_modules의 정보를 대조한 값이며, OSV는 알려진 취약점 데이터베이스입니다. 항목이 없다는 사실만으로 패키지나 앱 전체가 안전하다고 보장하지 않습니다.');
      if (data.lockfileVersion !== undefined) add(root, 'p', `lockfileVersion: ${Number.isSafeInteger(data.lockfileVersion) ? data.lockfileVersion : '확인 불가'}`);
      if (data.lockfileHash !== undefined) add(root, 'p', `lockfileHash: ${/^[0-9a-f]{64}$/.test(data.lockfileHash) ? data.lockfileHash : '확인 불가'}`);
      add(root, 'p', `조회 시각(checkedAt): ${iso(data.checkedAt)}`);
      if (data.code !== undefined) add(root, 'p', `사유 코드: ${safe(data.code)}`);
      if (Number.isSafeInteger(data.excluded?.count)) add(root, 'p', `조회 대상에서 제외한 패키지 수: ${data.excluded.count}`);
      if (packages.length === 0) {
        add(root, 'p', '표시할 패키지 결과가 없습니다. 조회하지 못한 것이며 취약점이 없다는 뜻이 아닙니다.');
        return root;
      }
      const list = document.createElement('ul');
      for (const pkg of packages) {
        const row = document.createElement('li');
        const valid = pkg && validName(pkg.name) && exactVersion(pkg.version) && Object.hasOwn(packageText, pkg.status);
        if (!valid) {
          add(row, 'p', '패키지 행 확인 불가 · 이름 또는 정확한 설치 버전이 아니어서 표시하지 않습니다. 취약점이 없다는 뜻이 아닙니다.');
          list.append(row);
          continue;
        }
        row.setAttribute('data-student-package-name', pkg.name);
        row.setAttribute('data-student-package-version', pkg.version);
        add(row, 'p', `패키지: ${pkg.name} · 설치 버전: ${pkg.version}`);
        const vulns = Array.isArray(pkg.vulnerabilities) ? pkg.vulnerabilities : [];
        add(row, 'p', pkg.status === 'unverifiable' && vulns.length > 0
          ? '조회 결과: 일부 확인 · 전체 조회 확인 불가(unverifiable) · 받은 ID는 아래에 유지합니다.'
          : `조회 결과: ${packageText[pkg.status]}`);
        add(row, 'p', `출처(source): ${safe(pkg.source)} · 조회 시각(checkedAt): ${iso(pkg.checkedAt)}`);
        if (vulns.length) {
          const ids = document.createElement('ul');
          for (const item of vulns) add(ids, 'li', `취약점 ID: ${safe(item?.id)} · modified: ${iso(item?.modified)}`);
          row.append(ids);
        }
        list.append(row);
      }
      root.append(list);
      return root;
    },
    renderAiConnection({ status, mode, data, error, checkedAt } = {}) {
      const root = document.createElement('section');
      const add = text => {
        const p = document.createElement('p');
        p.textContent = text;
        root.append(p);
      };
      // 제공 UI가 정제한 code/message만 받습니다. 원문 오류·help 객체는 출력하지 않습니다.
      const safe = value => typeof value === 'string' && value.trim()
        && !/Bearer\s+|-----BEGIN|\beyJ[\w-]+\.|\b(?:sk-|sb_secret_|ghp_|github_pat_)[\w-]+|(?:password|token|secret|api[_ -]?key|authorization|비밀번호|토큰)\s*[:=]/i.test(value)
        ? value : '확인 불가';
      const guidance = {
        ON_AI_PROVISIONING_PENDING: '권한 준비 중입니다. 담당자에게 계정 연결과 앱 권한 확인을 요청하세요. 학생 코드 수정으로 권한을 발급할 수 없습니다.',
        WB_CLCO_AUTH_REQUIRED: '인증 실패입니다. 계정 연결을 다시 확인하고 담당자에게 확인을 요청하세요.',
        WB_CLCO_ACCESS_BLOCKED: '접근 제한입니다. 계정 연결을 다시 확인하고 담당자에게 앱 이용 권한 확인을 요청하세요.',
        WB_CLCO_COHORT_BUDGET_EXHAUSTED: '반 사용량이 소진됐습니다. 담당자에게 확인하세요.',
        WB_CLCO_LIMIT_REACHED: '이용 한도에 도달했습니다. 담당자에게 확인하세요.',
        WB_CLCO_SESSION_CLOSED: '현재 이용 시간이 아닙니다. 이용 시간을 확인하세요.',
        WB_CLCO_RATE_LIMITED: '요청 제한입니다. 잠시 뒤 직접 다시 점검하세요.',
        ON_AI_AUTHORIZATION_CHANGED: '점검 중 권한이 변경됐습니다. 담당자에게 현재 권한을 확인한 뒤 직접 다시 점검하세요.',
        ON_AI_MODEL_LIST_EMPTY: '사용할 수 있는 모델이 없습니다. 담당자에게 모델 허용 설정 확인을 요청하세요.',
        MODEL_NOT_CONFIGURED: '모델 설정이 없습니다. 담당자에게 모델 허용 설정 확인을 요청하세요.',
        SUBJECT_SCOPE_UNVERIFIED: '계정과 사건의 연결을 확인할 수 없습니다. 담당자에게 계정 연결과 앱 권한 확인을 요청하세요.',
        AI_REQUEST_UNVERIFIED: '연결 또는 응답 확인 불가입니다. 네트워크와 계정 연결을 확인하고 잠시 뒤 직접 다시 점검하세요. 계속되면 담당자에게 앱 권한 확인을 요청하세요.',
      };
      const timeouts = ['WB_CLCO_TIMEOUT', 'REQUEST_TIMEOUT', 'ENGINE_TIMEOUT', 'TIMEOUT'];
      const cancelled = ['WB_CLCO_CANCELLED', 'CANCELLED', 'REQUEST_CANCELLED'];
      if (mode === 'demo') add('예제 자료(demo) · 실제 운영 연결 결과가 아닙니다.');
      else if (mode === 'disconnected') add('연결 없음');
      else if (mode === 'unknown') add('연결 상태 확인 불가');
      if (status === 'idle') add('AI 연결 점검 전');
      else if (status === 'loading') add('AI 연결 점검 중');
      else if (status === 'error') {
        add(`AI 연결 점검 실패 · 코드: ${safe(error?.code)} · 메시지: ${safe(error?.message)}`);
        if (timeouts.includes(error?.code)) add('시간 초과입니다. 잠시 뒤 직접 다시 점검하세요.');
        else if (cancelled.includes(error?.code)) add('점검이 취소됨. 이전 응답은 현재 결과가 아닙니다.');
        else add(Object.hasOwn(guidance, error?.code) ? guidance[error.code]
          : '원인 확인 불가입니다. 담당자에게 계정 연결과 앱 권한 확인을 요청하세요.');
      } else if (status === 'ok') {
        if (data?.transportChecked === true && ['test', 'verified'].includes(data.audienceAuthorization)) {
          add(data.audienceAuthorization === 'test' ? '시험 연결 점검(test)' : '앱 권한 확인 후 점검(verified)');
          add(`응답 모델 수(modelCount): ${Number.isInteger(data.modelCount) && data.modelCount >= 0 ? data.modelCount : '확인 불가'}`);
          add(`점검 시각(checkedAt): ${safe(checkedAt)}`);
          add('권한과 모델 응답은 위 점검 시각 기준입니다.');
        } else add('AI 연결 점검 결과 확인 불가');
        add('연결만 점검했으며 사건 설명은 아직 실행하지 않았습니다. 보안 기록에서 별도로 요청한 사건 설명 결과를 확인하세요.');
      } else add('AI 연결 점검 상태 확인 불가');
      add('재점검은 현재 API 연결 점검 버튼을 직접 누르세요. 자동으로 다시 점검하지 않습니다.');
      add('워크벤치 수업용 AI는 코드 작성을 돕고, 앱 안의 AI는 별도로 요청한 보안 사건을 설명합니다. ALEPH 공식 과제 판정 AI는 제출 코드를 검토합니다. 연결 점검은 사건 설명이나 과제 통과를 뜻하지 않습니다.');
      return root;
    },
    renderExplanation({ event, explanation, checkedAt } = {}) {
      const root = document.createElement('section');
      const add = (parent, tag, text) => {
        const node = document.createElement(tag);
        node.textContent = text;
        parent.append(node);
        return node;
      };
      const safe = value => typeof value === 'string' && value.trim()
        && !/Bearer\s+|-----BEGIN|\beyJ[\w-]+\.|\b(?:sk-|sb_secret_|ghp_|github_pat_)[\w-]+|(?:password|token|secret|api[_ -]?key|authorization|비밀번호|토큰)\s*[:=]/i.test(value)
        ? value : '확인 불가';
      const list = (parent, rows) => {
        const ul = document.createElement('ul');
        for (const text of rows) add(ul, 'li', text);
        parent.append(ul);
      };
      // 성공 표식은 아래 검증을 모두 통과한 설명에만 붙입니다.
      const reject = reason => {
        add(root, 'p', `AI 설명을 사용할 수 없음 · 사유: ${reason}`);
        add(root, 'p', '근거가 이 기록과 맞지 않는 설명은 표시하지 않으며 내용을 만들어 맞추지 않습니다. 기존 보안 기록은 그대로입니다.');
        return root;
      };
      if (explanation?.mode === 'demo') add(root, 'p', '예제 자료(demo) · 실제 운영 연결 결과가 아닙니다.');
      if (explanation?.status === 'error') {
        const code = explanation.error?.code;
        add(root, 'p', `AI 설명 실패 · 코드: ${safe(code)} · 메시지: ${safe(explanation.error?.message)}`);
        if (code === 'ON_AI_PROVISIONING_PENDING') {
          add(root, 'p', '사건 설명 권한 준비 중입니다. 학생 코드의 불합격을 뜻하지 않습니다. 담당자에게 계정 연결과 앱의 ai.explain 권한 확인을 요청하세요.');
        } else if (['WB_CLCO_AUTH_REQUIRED', 'WB_CLCO_ACCESS_BLOCKED'].includes(code)) {
          add(root, 'p', '계정 연결과 AI 앱 승인 상태를 다시 확인하고 담당자에게 인증·앱 권한 확인을 요청하세요.');
        } else if (['SUBJECT_SCOPE_UNVERIFIED', 'AI_REQUEST_UNVERIFIED'].includes(code)) {
          add(root, 'p', '실제 사건 설명 성공은 확인 불가입니다. 담당자에게 계정 연결과 앱 권한 확인을 요청하세요.');
        } else if (['ON_AI_INVALID_OUTPUT', 'ON_AI_INVALID_INPUT'].includes(code)) {
          add(root, 'p', '실패 이유: 근거 부족 또는 근거 불일치입니다. 인용한 근거 ID가 이 기록과 맞지 않거나, 이미 실행했다고 답한 설명은 사용할 수 없습니다.');
        }
        add(root, 'p', '기존 보안 기록은 그대로이며 과제 실패가 아닙니다. 자동으로 다시 요청하지 않습니다.');
        return root;
      }
      if (!event) { add(root, 'p', '보안 기록에서 기록을 먼저 고르세요.'); return root; }
      if (!explanation || explanation.status === 'idle') { add(root, 'p', '사건 설명 요청 전입니다. 연결 점검과 사건 설명은 별도입니다.'); return root; }
      if (explanation.status === 'loading') { add(root, 'p', '사건 설명 요청 중입니다. 아직 결과가 없습니다.'); return root; }
      if (explanation.status !== 'ok') { add(root, 'p', '사건 설명 상태 확인 불가. 기존 보안 기록은 그대로입니다.'); return root; }

      const data = explanation.data;
      const evidence = Array.isArray(event.evidence) ? event.evidence : [];
      const evidenceText = new Map(evidence.map(row => [row?.id, row?.text]));
      const refsOk = ids => Array.isArray(ids) && ids.length > 0 && new Set(ids).size === ids.length
        && ids.every(id => typeof id === 'string' && evidenceText.has(id));
      if (safe(event.id) === '확인 불가') return reject('기록 ID 확인 불가');
      if (!data || typeof data !== 'object' || safe(data.summary) === '확인 불가') return reject('AI 요약 확인 불가');
      if (evidence.length === 0) return reject('근거 부족 · 이 기록에 근거가 없습니다');
      if (!refsOk(data.evidenceIds)) return reject('근거 불일치 · 인용한 근거 ID가 이 기록의 근거에 없거나 중복·누락입니다');
      if (data.executed !== false || data.requiresHumanConfirmation !== true) return reject('이미 실행했다고 답했거나 사람 확인 조건이 없는 설명입니다');
      const proposals = Array.isArray(data.proposals) ? data.proposals : null;
      const supported = Array.isArray(event.supportedActions) ? event.supportedActions : [];
      if (!proposals || !proposals.every(p => p && supported.includes(p.action) && refsOk(p.evidenceIds) && safe(p.reason) !== '확인 불가')) {
        return reject('제안의 조치 또는 근거가 이 기록과 맞지 않습니다');
      }

      root.setAttribute('data-student-explanation-event', event.id);
      add(root, 'p', `사건 ID: ${safe(event.id)}`);
      add(root, 'h3', 'AI 설명(참고용)');
      add(root, 'p', safe(data.summary));
      add(root, 'p', 'AI 설명은 해석입니다. 사실은 아래 근거 글과 연동 시스템이 알려 준 상태로 판단하세요.');

      add(root, 'h4', '인용한 근거');
      list(root, data.evidenceIds.map(id => `${safe(id)} — ${safe(evidenceText.get(id))}`));

      add(root, 'h4', '규칙');
      const rules = Array.isArray(event.rules) ? event.rules : [];
      if (rules.length) list(root, rules.map(rule => `${safe(rule?.id)} — ${safe(rule?.text)}`));
      else add(root, 'p', '없음');

      add(root, 'h4', '확인 불가 상태');
      const names = { access: '접속', session: '세션', device: '기기' };
      const unknown = Object.entries(names).filter(([key]) => event.state?.[key] === 'unknown')
        .map(([key, name]) => `${name}: 확인 불가(unknown)`);
      if (unknown.length) list(root, unknown);
      else add(root, 'p', '없음');

      add(root, 'h4', '조치 제안');
      if (proposals.length === 0) {
        add(root, 'p', supported.length === 0
          ? '연동 시스템이 지원하는 조치가 없어 제안이 없습니다(정상).'
          : 'AI가 제안한 조치가 없습니다.');
      } else {
        list(root, proposals.map(p => `조치: ${safe(p.action)} · 이유: ${safe(p.reason)} · 사람 확인이 필요하며 실행되지 않았습니다.`));
      }
      add(root, 'p', `확인 시각(checkedAt): ${safe(checkedAt)}`);
      return root;
    },
    renderAction({ status, event, actionId, target, receipt, observation, message, confirmationExpiresAt, error } = {}) {
      const root = document.createElement('section');
      const add = (tag, text) => {
        const node = document.createElement(tag);
        node.textContent = text;
        root.append(node);
        return node;
      };
      const safe = value => typeof value === 'string' && value.trim() && value.length <= 300
        && !/Bearer\s+|-----BEGIN|\beyJ[\w-]+\.|\b(?:sk-|sb_secret_|ghp_|github_pat_)[\w-]+|ac-on-[\w-]{20,}|(?:password|token|secret|api[_ -]?key|authorization|confirmationId|비밀번호|토큰)\s*[:=]/i.test(value)
        ? value : '확인 불가';
      const num = value => (Number.isSafeInteger(value) ? String(value) : '확인 불가');
      const eventId = safe(event?.id);
      const requestId = safe(receipt?.requestId);
      const known = ['idle', 'loading', 'executing', 'prepared', 'pending', 'succeeded', 'denied', 'failed', 'unknown', 'error', 'expired'];
      // 효과 확인은 succeeded이면서 effectApplied가 true이고 관측 시각·receiptId가 있을 때만 인정합니다.
      const effectConfirmed = status === 'succeeded' && observation?.effectApplied === true
        && safe(observation.observedAt) !== '확인 불가' && safe(receipt?.receiptId) !== '확인 불가';
      const shown = status === 'succeeded' && !effectConfirmed ? 'unknown' : status;
      if (!known.includes(shown)) {
        add('p', '조치 상태 확인 불가. 성공이나 효과 없음으로 판단하지 말고 제공 화면의 「연동 시스템 결과만 재조회」를 직접 누르세요.');
        return root;
      }
      const headline = {
        idle: '아직 미실행(idle)',
        loading: '조치 준비 또는 결과 조회 중(loading) · 아직 결과가 없습니다.',
        prepared: '준비됨·미실행(prepared) · 사람이 대상과 조치를 확인하기 전에는 전달되지 않습니다.',
        executing: '서버에 전달 중(executing) · 결과가 아직 확인되지 않았습니다.',
        pending: '서버 접수·처리 중(pending) · 서버가 요청을 받았다는 확인(ACK)일 뿐 조치 효과가 확인된 것은 아닙니다. 결과가 아직 확인되지 않았습니다.',
        succeeded: '효과 확인(succeeded) · 연동 시스템이 관측한 결과입니다.',
        denied: '거절(denied) · 연동 시스템이 이 조치를 허용하지 않았습니다.',
        failed: '실패(failed) · 연동 시스템이 조치를 처리하지 못했습니다.',
        unknown: '결과 불명(unknown) · 효과가 적용됐다고도 적용되지 않았다고도 판단하지 마세요.',
        expired: '확인 기한 지남(expired) · 조치를 다시 준비하고 대상을 확인하세요.',
        error: '요청 처리 안 됨(error) · 조치가 서버에 전달되지 않았을 수 있으며 효과를 확인한 것도 아닙니다.',
      };
      add('p', `조치 상태: ${headline[shown]}`);
      if (status === 'succeeded' && !effectConfirmed) {
        add('p', '서버가 succeeded를 보냈지만 effectApplied: true인 관측과 관측 시각·receiptId가 없어 효과 확인으로 인정하지 않습니다.');
      }
      if (shown === 'idle') {
        add('p', Array.isArray(event?.supportedActions) && event.supportedActions.length === 0
          ? '이 기록은 연동 시스템이 지원하는 조치가 없어 「조치 준비」 버튼이 나오지 않는 것이 정상입니다.'
          : '조치는 제공 화면에서 AI 제안의 「조치 준비」를 눌러 시작합니다.');
      }
      if (shown === 'prepared') {
        add('p', `확인 기한(confirmationExpiresAt): ${safe(confirmationExpiresAt)}`);
        add('p', '실제 집행은 제공 화면의 「대상과 조치를 확인했으며 집행합니다」를 사람이 직접 눌러야 시작합니다. 이 화면에는 실행 버튼이 없습니다.');
      }
      if (shown === 'executing' || shown === 'pending') {
        add('p', '같은 요청을 다시 전달하지 마세요. 결과는 제공 화면의 「연동 시스템 결과만 재조회」로 확인합니다.');
      }
      if (shown === 'unknown') add('p', '제공 화면의 「연동 시스템 결과만 재조회」를 직접 눌러 결과만 다시 조회하세요. 자동으로 다시 요청하지 않습니다.');
      if (['denied', 'failed', 'error'].includes(shown) || (shown === 'unknown' && (message || error))) {
        if (message) add('p', `메시지: ${safe(message)}`);
        if (error) add('p', `코드: ${safe(error.code)} · 메시지: ${safe(error.message)}`);
      } else if (message && ['loading', 'executing'].includes(shown)) add('p', `메시지: ${safe(message)}`);
      if (effectConfirmed && shown === 'succeeded') {
        add('p', `관측 시각(observedAt): ${safe(observation.observedAt)}`);
        add('p', 'effectApplied: true');
        add('p', `receiptId: ${safe(receipt.receiptId)}`);
      }
      if (receipt?.replayed === true) add('p', '같은 요청의 저장된 응답(replayed: true)입니다. 새로 실행된 것이 아니며 중복 집행하지 않습니다.');

      const rows = [];
      if (event) rows.push(['사건 ID', eventId]);
      const evidenceIds = Array.isArray(event?.evidence) ? event.evidence.map(row => safe(row?.id)) : [];
      if (evidenceIds.length) rows.push(['근거 ID', evidenceIds.join(', ')]);
      if (actionId) rows.push(['조치(actionId)', safe(actionId)]);
      if (target) {
        rows.push(['대상 ID(target.id)', safe(target.id)]);
        rows.push(['대상 세대(generation)', num(target.generation)]);
      }
      if (receipt) {
        if (receipt.requestId) rows.push(['요청 ID(requestId)', requestId]);
        if (receipt.receiptId) rows.push(['receiptId', safe(receipt.receiptId)]);
        if (receipt.version !== undefined) rows.push(['version', num(receipt.version)]);
      }
      if (rows.length) {
        const ul = document.createElement('ul');
        for (const [name, value] of rows) {
          const li = document.createElement('li');
          li.textContent = `${name}: ${value}`;
          ul.append(li);
        }
        root.append(ul);
      }
      add('p', 'AI 제안, 사람 확인, 서버 접수(ACK), 실제 효과 확인은 서로 다른 단계입니다. 「조치 화면 취소」는 이미 서버에 전달된 조치 효과를 되돌리지 않습니다.');
      // 속성은 사건과 요청이 모두 확인된 정상 표시에만 붙입니다.
      if (['prepared', 'executing', 'pending', 'succeeded', 'denied', 'failed', 'unknown'].includes(shown)
        && !(status === 'succeeded' && !effectConfirmed) && eventId !== '확인 불가' && requestId !== '확인 불가') {
        root.setAttribute('data-student-action-event', event.id);
        root.setAttribute('data-student-action-request', receipt.requestId);
      }
      return root;
    },
  };
}
