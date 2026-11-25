/* ⚙ API 설정창: 각자 자기 키를 넣어 이 브라우저(localStorage)에만 저장한다.
   키는 해당 기관 서버로만 보내고, 이 사이트나 GitHub 에는 보내지 않는다.
   새 API 를 붙이려면 아래 PROVIDERS 에 한 칸을 더하면 된다. */
(() => {
  const RE = window.RE = window.RE || {};
  const DGK = 'https://apis.data.go.kr/1613000/';
  const search = q => 'https://www.data.go.kr/tcs/dss/selectDataSetList.do?keyword=' + encodeURIComponent(q);

  async function hit(url) {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const t = await r.text();
    if (!r.ok) return { ok: false, msg: `서버 응답 ${r.status}` };
    const code = (t.match(/<resultCode>([^<]*)</) || t.match(/"resultCode"\s*:\s*"([^"]*)"/) || [])[1];
    const msg = (t.match(/<resultMsg>([^<]*)</) || t.match(/"resultMsg"\s*:\s*"([^"]*)"/) || t.match(/<returnAuthMsg>([^<]*)</) || [])[1] || '';
    if (code === '000' || code === '00') return { ok: true };
    if (/SERVICE_KEY_IS_NOT_REGISTERED|NOT_REGISTERED/i.test(t)) return { ok: false, msg: '이 API 활용신청이 안 되어 있거나 승인 대기 중입니다' };
    return { ok: false, msg: msg || code || '알 수 없는 응답' };
  }

  const PROVIDERS = [
    {
      id: 'datagokr', name: '공공데이터포털', store: 're.key.datagokr', cost: '무료',
      use: '아파트 실거래가(매매·전월세)·건축물대장 → 시세 지도와 단지 정보',
      steps: [
        ['국토교통부_아파트 매매 실거래가 상세 자료', search('아파트 매매 실거래가 상세 자료')],
        ['국토교통부_아파트 전월세 실거래가 자료', search('아파트 전월세 실거래가 자료')],
        ['국토교통부_건축HUB_건축물대장정보 서비스', search('건축HUB 건축물대장정보')],
      ],
      help: '공공데이터포털(data.go.kr)에 가입한 뒤 위 3개 API에 각각 [활용신청]을 누르세요. 마이페이지의 "일반 인증키(Decoding)"를 넣으면 됩니다. 승인까지 몇 분~1시간 걸릴 수 있습니다.',
      tests: [
        ['아파트 매매(상세)', k => hit(`${DGK}RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev?serviceKey=${encodeURIComponent(k)}&LAWD_CD=11590&DEAL_YMD=202501&numOfRows=1&pageNo=1`)],
        ['아파트 전월세', k => hit(`${DGK}RTMSDataSvcAptRent/getRTMSDataSvcAptRent?serviceKey=${encodeURIComponent(k)}&LAWD_CD=11590&DEAL_YMD=202501&numOfRows=1&pageNo=1`)],
        ['건축물대장', k => hit(`${DGK}BldRgstHubService/getBrRecapTitleInfo?serviceKey=${encodeURIComponent(k)}&sigunguCd=11590&bjdongCd=10200&bun=0904&ji=0000&numOfRows=1&pageNo=1&_type=json`)],
      ],
    },
    {
      id: 'vworld', name: '브이월드', store: 'town3d.vworldKey', cost: '무료',
      use: '건물 지상층수·높이(GIS건물통합정보) → 3D 건물 높이를 실제에 가깝게 (원본 기능)',
      steps: [['브이월드 오픈API 인증키 발급', 'https://www.vworld.kr/dev/v4dv_apikey_s001.do']],
      help: '활용 API에 "2D 데이터 API"를 고르고, 서비스 URL에 이 페이지 주소(' + location.origin + ')를 등록하세요.',
      tests: [['GIS건물통합정보', k => fetch(`https://api.vworld.kr/req/data?service=data&version=2.0&request=GetFeature&data=LT_C_BLDGINFO&format=json&errorFormat=json&size=1&geometry=false&attribute=true&crs=EPSG:4326&geomFilter=BOX(126.94,37.51,126.941,37.511)&key=${encodeURIComponent(k)}&domain=${encodeURIComponent(location.origin)}`, { signal: AbortSignal.timeout(15000) })
        .then(r => r.json()).then(j => { const s = j.response && j.response.status; return s === 'OK' || s === 'NOT_FOUND' ? { ok: true } : { ok: false, msg: (j.response && j.response.error && j.response.error.text) || s || '오류' }; })]],
    },
  ];
  RE.PROVIDERS = PROVIDERS;

  const get = p => { try { return localStorage.getItem(p.store) || ''; } catch (e) { console.warn('[RE] 키 읽기 실패', e.message); return ''; } };
  /* 공공데이터포털의 'Encoding' 키(%2B 등)를 넣어도 동작하게 원래 글자로 되돌린다 */
  RE.cleanKey = k => { k = String(k || '').trim(); try { return /%[0-9A-F]{2}/i.test(k) ? decodeURIComponent(k) : k; } catch (e) { console.warn('[RE] 키 형식 확인 필요', e.message); return k; } };
  RE.key = id => { const p = PROVIDERS.find(x => x.id === id); return p ? get(p) : ''; };

  let dlg;
  function build() {
    const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
    dlg = el('dialog', 're-keys'); dlg.setAttribute('aria-label', 'API 설정');
    const form = el('form'); form.method = 'dialog';
    form.append(el('h2', null, '⚙ API 설정'),
      el('p', 're-keys-note', '키는 이 브라우저에만 저장되고, 해당 기관 서버로만 보냅니다. 같은 주소(github.io)의 다른 사이트도 이 저장 공간을 볼 수 있으니, 무료 공공데이터 키만 넣고 공용 PC에서는 다 쓴 뒤 [모든 키 지우기]를 눌러 주세요.'));
    for (const p of PROVIDERS) {
      const sec = el('section');
      const h = el('h3'); h.append(el('span', null, p.name), el('em', null, p.cost)); sec.append(h, el('p', null, p.use));
      const ol = el('ol'); for (const [t, u] of p.steps) { const li = el('li'), a = el('a', null, t + ' ↗'); a.href = u; a.target = '_blank'; a.rel = 'noopener'; li.append(a); ol.append(li); }
      sec.append(ol, el('p', 're-keys-help', p.help));
      const row = el('div', 're-keys-row'), inp = el('input'); inp.type = 'password'; inp.autocomplete = 'off'; inp.spellcheck = false; inp.placeholder = p.name + ' 인증키'; inp.value = get(p); inp.id = 'reKey_' + p.id;
      const eye = el('button', null, '보기'); eye.type = 'button'; eye.onclick = () => { inp.type = inp.type === 'password' ? 'text' : 'password'; eye.textContent = inp.type === 'password' ? '보기' : '숨기기'; };
      const tb = el('button', null, '연결 시험'); tb.type = 'button';
      const out = el('ul', 're-keys-out');
      tb.onclick = async () => {
        const k = RE.cleanKey(inp.value); out.textContent = '';
        if (!k) { out.append(el('li', 'bad', '키를 먼저 넣어 주세요')); return; }
        for (const [name, fn] of p.tests) {
          const li = el('li', null, name + ' · 확인 중…'); out.append(li);
          try { const r = await fn(k); li.className = r.ok ? 'ok' : 'bad'; li.textContent = `${r.ok ? '✅' : '❌'} ${name}${r.ok ? ' 정상' : ' · ' + r.msg}`; }
          catch (e) { li.className = 'bad'; li.textContent = `❌ ${name} · 연결 실패 (${e.name === 'TimeoutError' ? '응답 없음' : e.message})`; }
        }
      };
      row.append(inp, eye, tb); sec.append(row, out); form.append(sec);
    }
    const act = el('div', 're-keys-act');
    const save = el('button', 'primary', '저장'); save.type = 'button';
    save.onclick = () => {
      try { for (const p of PROVIDERS) { const v = RE.cleanKey(document.getElementById('reKey_' + p.id).value); v ? localStorage.setItem(p.store, v) : localStorage.removeItem(p.store); } }
      catch (e) { alertMsg('이 브라우저에서는 키를 저장할 수 없습니다 (' + e.message + ')'); return; }
      alertMsg('저장했습니다. 지도를 다시 열면 적용됩니다.', true);
    };
    const wipe = el('button', null, '모든 키 지우기'); wipe.type = 'button';
    wipe.onclick = () => { for (const p of PROVIDERS) { try { localStorage.removeItem(p.store); } catch (e) { console.warn('[RE] 키 삭제 실패', e.message); } document.getElementById('reKey_' + p.id).value = ''; } alertMsg('모든 키를 지웠습니다.', true); };
    const close = el('button', null, '닫기'); close.value = 'close';
    const msg = el('p', 're-keys-msg'); msg.id = 'reKeysMsg';
    act.append(save, wipe, close); form.append(act, msg); dlg.append(form); document.body.append(dlg);
  }
  function alertMsg(t, ok) { const m = document.getElementById('reKeysMsg'); m.textContent = t; m.className = 're-keys-msg ' + (ok ? 'ok' : 'bad'); }
  RE.openKeys = () => { if (!dlg) build(); dlg.showModal(); };

  /* 왼쪽 카드에 ⚙ 버튼. 원본의 '브이월드 키' 칸은 이 설정창으로 합쳤으므로 숨긴다(같은 저장 위치를 쓴다). */
  function addButton() {
    const row = document.querySelector('.card .row');
    if (!row) return;
    const b = document.createElement('button'); b.id = 'bKeys'; b.textContent = '⚙ API 설정'; b.onclick = RE.openKeys; row.append(b);
    const vw = document.getElementById('vwBox'); if (vw) vw.hidden = true;
  }
  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', addButton) : addButton();
})();
