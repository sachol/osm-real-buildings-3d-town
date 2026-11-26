/* ===== 내 사무소 설정 (수강생용) =====
   코드·GitHub 없이 이 페이지에서 사무소 이름·전화·주소를 넣으면, 이 브라우저에서는 그 사무소의 지도가 된다.
   - 저장: 이 브라우저(localStorage)에만. 다른 PC·브라우저에서는 다시 넣어야 한다.
   - 적용: re-config.js 바로 뒤(<head>)에서 RE_CONFIG 를 새 객체로 바꿔 끼운다(다른 파일은 그 뒤에 읽음).
   - 사무소 주소가 있으면 처음 열 때 그 주소 반경으로 바로 시작한다(?addr= 주소로 이동).
   - 제목('신화AI 3D 부동산 라이브 지도')은 바꾸지 않는다. 휴대폰 브리핑 QR 은 숨긴다(브리핑 자료가 기본 동네 것이므로). */
(() => {
  const RE = window.RE = window.RE || {};
  const STORE = 'town3d.myOffice';
  const LIM = { name: 30, brand: 40, tel: 20, addr: 60, tagline: 60 };
  const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);

  function read() {
    try {
      const j = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (!j || !clip(j.name, LIM.name) || !clip(j.addr, LIM.addr)) return null;
      return { name: clip(j.name, LIM.name), brand: clip(j.brand, LIM.brand), tel: clip(j.tel, LIM.tel), addr: clip(j.addr, LIM.addr),
        r: [1, 3, 5].includes(+j.r) ? +j.r : 3, tagline: clip(j.tagline, LIM.tagline) };
    } catch (e) { console.warn('[내 사무소] 저장된 설정을 읽지 못했습니다:', e.message); return null; }
  }
  const my = read();
  RE.myOffice = my;
  /* 사이트 기본 설정(대표님 사무소). 설정창에 '지금 기본 지도' 안내로 보여 준다 */
  const base = window.RE_CONFIG || {};
  const baseName = (base.office && base.office.label) || base.brand || '';
  const baseTel = (base.contact && base.contact.tel) || '';

  /* ---------- 설정 적용(원본 RE_CONFIG 는 그대로 두고 새 객체로) ---------- */
  if (my && window.RE_CONFIG) {
    const C = window.RE_CONFIG;
    window.RE_CONFIG = {
      ...C,
      custom: true,
      brand: my.brand || my.name,
      office: { ...(C.office || {}), show: true, label: my.name },
      contact: { tel: my.tel, email: '' },
      idle: { ...(C.idle || {}), tagline: my.tagline || (C.idle && C.idle.tagline) || '' },
    };
    /* 처음 열 때 내 사무소 동네로 (주소가 이미 붙어 있으면 그대로 둔다) */
    const qs = new URLSearchParams(location.search);
    if (!qs.get('addr') && !qs.get('dump')) {
      qs.set('addr', my.addr); qs.set('r', String(my.r));
      location.replace(location.pathname + '?' + qs.toString() + location.hash);
    }
  }

  /* 실시간(주소) 모드에서 지금 연 주소가 내 사무소 주소이면, 지도 중심(0,0)에 ★ 사무소 핀을 세운다.
     (지도 쪽 장소 이름은 '흑석역(중대입구)'처럼 바뀔 수 있어 주소창의 addr 로 비교) */
  const norm = s => String(s || '').replace(/\s/g, '');
  RE.myOfficeFor = D => {
    const opened = new URLSearchParams(location.search).get('addr');
    return my && D && norm(opened) === norm(my.addr) ? { name: my.name, addr: my.addr, x: 0, z: 0, how: 'geo' } : null;
  };

  /* ---------- 설정 창 ---------- */
  let dlg;
  function field(form, label, key, opt = {}) {
    const wrap = document.createElement('label'); wrap.className = 're-my-f';
    const t = document.createElement('span'); t.textContent = label + (opt.req ? ' *' : '');
    const i = document.createElement(opt.select ? 'select' : 'input');
    if (opt.select) for (const v of opt.select) { const o = document.createElement('option'); o.value = String(v); o.textContent = v + ' km'; i.append(o); }
    else { i.type = opt.type || 'text'; i.maxLength = LIM[key] || 60; i.placeholder = opt.ph || ''; }
    i.name = key; if (opt.req) i.required = true;
    i.value = my ? String(my[key] ?? '') : (opt.select ? '3' : '');
    wrap.append(t, i); form.append(wrap); return i;
  }
  function build() {
    const el = RE.el;
    dlg = el('dialog', 're-keys re-my-dlg'); dlg.setAttribute('aria-label', '내 사무소 설정');
    const form = el('form');
    const baseLine = baseName ? el('p', 're-my-base', `${my ? '기본 지도' : '지금 지도'}: ${baseName}${baseTel ? ' · ' + baseTel : ''} (기본 설정). 이 사무소라면 아무것도 넣지 않아도 됩니다.`) : null;
    form.append(el('h2', null, '🏢 다른 사무소로 바꾸기 (수강생용)'), ...(baseLine ? [baseLine] : []),
      el('p', 're-keys-note', '사무소 이름과 주소를 넣으면 이 브라우저에서는 내 사무소 주변 3D 시세 지도로 바뀝니다. 이 브라우저에만 저장되고 인터넷으로 보내지 않습니다. 시세를 보려면 ⚙ API 설정에 공공데이터포털 키도 넣어 주세요. 처음 열 때는 지도와 실거래를 받느라 1분 정도 걸릴 수 있습니다.'));
    field(form, '사무소 이름', 'name', { req: true, ph: '예: ○○공인중개사사무소' });
    field(form, '제작 표기', 'brand', { ph: '비워 두면 사무소 이름 (예: ○○부동산)' });
    field(form, '전화번호', 'tel', { type: 'tel', ph: '예: 02-123-4567' });
    field(form, '사무소 주소', 'addr', { req: true, ph: '예: 서울 동작구 상도로 123 / 흑석역' });
    field(form, '보여 줄 반경', 'r', { select: [1, 3, 5] });
    field(form, '대기 화면 소개 문구', 'tagline', { ph: '예: 흑석동 아파트 전문, 시세를 3D로 브리핑해 드립니다' });
    const msg = el('p', 're-keys-msg'); msg.setAttribute('role', 'status');
    const act = el('div', 're-keys-act');
    const bSave = el('button', 'primary', '저장하고 내 동네 열기'); bSave.type = 'submit';
    const bClear = el('button', null, '내 설정 지우기'); bClear.type = 'button'; bClear.disabled = !my;
    const bClose = el('button', null, '닫기'); bClose.type = 'button'; bClose.onclick = () => dlg.close();
    act.append(bSave, bClear, bClose); form.append(msg, act); dlg.append(form); document.body.append(dlg);

    form.onsubmit = e => {
      e.preventDefault();
      const f = new FormData(form), v = k => clip(f.get(k), LIM[k] || 10);
      const data = { name: v('name'), brand: v('brand'), tel: v('tel'), addr: v('addr'), r: +f.get('r') || 3, tagline: v('tagline') };
      if (!data.name || !data.addr) { msg.className = 're-keys-msg bad'; msg.textContent = '사무소 이름과 주소는 꼭 넣어 주세요.'; return; }
      if (data.tel && !/^[0-9+\-() ]{7,20}$/.test(data.tel)) { msg.className = 're-keys-msg bad'; msg.textContent = '전화번호는 숫자와 - 만 넣어 주세요.'; return; }
      try { localStorage.setItem(STORE, JSON.stringify(data)); }
      catch (err) { msg.className = 're-keys-msg bad'; msg.textContent = '이 브라우저에 저장하지 못했습니다(개인정보 보호 모드 등): ' + err.message; return; }
      msg.className = 're-keys-msg ok'; msg.textContent = '저장했습니다. 내 동네 지도를 엽니다…';
      location.href = location.pathname + '?addr=' + encodeURIComponent(data.addr) + '&r=' + data.r;
    };
    bClear.onclick = () => {
      try { localStorage.removeItem(STORE); }
      catch (err) { msg.className = 're-keys-msg bad'; msg.textContent = '지우지 못했습니다: ' + err.message; return; }
      location.href = location.pathname;
    };
  }
  function open() { if (!dlg) build(); dlg.showModal(); }

  /* 왼쪽 카드 맨 아래(지도 출처 위)에 작은 버튼 */
  function addButton() {
    const card = document.querySelector('.card'), credit = document.getElementById('credit');
    if (!card || card.querySelector('.re-my-btn')) return;
    const b = RE.el('button', 're-my-btn', my ? `🏢 내 사무소: ${my.name} (바꾸기)` : '🏢 다른 사무소로 바꾸기 (수강생용)');
    b.type = 'button'; b.onclick = open;
    if (credit) credit.before(b); else card.append(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addButton); else addButton();

  RE.openMyOffice = open;
})();
