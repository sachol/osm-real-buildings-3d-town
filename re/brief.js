/* 모바일 브리핑 페이지: 분류 칩 · 검색 · 정렬 · 단지 카드 · [3D로 보기] · 홈 화면에 추가 */
(() => {
  const RE = window.RE, CFG = window.RE_CONFIG || {}, RD = window.RE_DATA;
  const { el, won, statsFor, builtYear, walkMin, median } = RE;
  const $ = id => document.getElementById(id);
  const NOW = new Date().getFullYear(), PAGE = 30;

  if (!RD || !RD.C || !RD.C.length) { $('heroS').textContent = '아직 실거래 데이터가 없습니다.'; return; }

  /* ---------- 단지마다 미리 계산 ---------- */
  const ST = RD.ST || [];
  const rows = RD.C.map(c => {
    const all = statsFor(c, 'all'), m = statsFor(c, 'm'), by = builtYear(c);
    let st = null; for (const [n, x, z] of ST) { const d = Math.hypot(x - c.x, z - c.z); if (!st || d < st.d) st = { n, d }; }
    const last = c.T.at(-1);
    return { c, all, m, by, age: by ? NOW - by : null, st, last };
  }).filter(r => r.all.n || r.c.R.length);

  /* ---------- 상단 문구 ---------- */
  const months = RD.meta.months.map(s => `${s.slice(0, 4)}.${s.slice(4)}`);
  const place = (RD.meta.center || '우리 동네').replace(/역$/, '');
  document.title = `${place} 아파트 시세 브리핑`;
  $('bTitle').textContent = `${place} 아파트 시세 브리핑`;
  $('bBrand').textContent = CFG.brand || (CFG.office && CFG.office.label) || '';
  $('notice').textContent = `국토교통부 실거래 신고 기준(${months[0]}~${months[1]}) 참고 자료입니다. 해제된 거래는 뺐고, 계약 판단은 원자료와 현장 확인이 필요합니다.`;
  $('eyebrow').textContent = `${RD.meta.center} 반경 ${RD.meta.r / 1000} km`;
  $('heroT').textContent = `${place} 아파트, 최근 12개월 시세`;
  const nT = rows.reduce((s, r) => s + r.c.T.length, 0), nR = rows.reduce((s, r) => s + r.c.R.length, 0);
  $('heroS').textContent = `아파트 ${rows.length.toLocaleString()}곳의 매매 ${nT.toLocaleString()}건 · 전월세 ${nR.toLocaleString()}건을 단지별로 정리했습니다.`;
  const kpi = (label, val) => { const d = el('div'); d.append(el('small', null, label), el('b', null, val)); $('kpis').append(d); };
  const pps = rows.filter(r => r.all.n >= 3).map(r => r.all.pp), jrs = rows.filter(r => r.all.jr && r.all.nj >= 3).map(r => r.all.jr);
  kpi('평당가 중앙값', pps.length ? won(median(pps)) : '-');
  kpi('전세가율 중앙값', jrs.length ? Math.round(median(jrs)) + '%' : '-');
  kpi('매매 거래', nT.toLocaleString() + '건');

  /* ---------- 사무소 카드 ---------- */
  const o = RD.office;
  if (o && o.how && CFG.office && CFG.office.show) {
    const box = $('office'); box.hidden = false;
    let st = null; for (const [n, x, z] of ST) { const d = Math.hypot(x - o.x, z - o.z); if (!st || d < st.d) st = { n, d }; }
    box.append(el('p', 'eyebrow', '우리 사무소'), el('h2', null, CFG.office.label || o.name), el('p', null, o.addr + (st ? ` · ${st.n} 도보 약 ${walkMin(st.d, CFG.walkSpeed)}분` : '')));
    box.append(contactRow());
  }
  function contactRow(about) {
    const row = el('div', 'cta'), ct = CFG.contact || {};
    if (ct.tel) { const a = el('a', 'call', '전화 상담'); a.href = 'tel:' + ct.tel.replace(/[^0-9+]/g, ''); row.append(a); }
    if (ct.email) {
      /* 메일 앱이 열리면서 제목에 단지 이름이 미리 들어간다 */
      const subject = about ? `[시세 브리핑] ${about} 상담 문의` : '[시세 브리핑] 상담 문의';
      const a = el('a', 'mail', '메일 상담'); a.href = `mailto:${ct.email}?subject=${encodeURIComponent(subject)}`; row.append(a);
    }
    return row;
  }

  /* ---------- 분류 칩 ---------- */
  const topIds = new Set(rows.filter(r => r.all.n >= 3).sort((a, b) => b.all.pp - a.all.pp).slice(0, 20).map(r => r.c.id));
  const near = (CFG.walkRings || [400, 800]).at(-1);
  const CHIPS = [
    ['all', '전체', () => true],
    ['top', '평당가 TOP 20', r => topIds.has(r.c.id)],
    ['m', '국민평형 거래', r => r.m.n > 0],
    ['st', `역세권 ${near} m`, r => r.st && r.st.d <= near],
    ['new', '신축 10년 이내', r => r.age != null && r.age <= 10],
    ['old', '30년 이상', r => r.age != null && r.age >= 30],
    ['jr', '전세가율 70%↑', r => r.all.jr >= 70 && r.all.nj >= 3],
  ];
  const state = { chip: 'all', q: '', sort: 'pp', shown: PAGE };
  for (const [k, t, fn] of CHIPS) {
    const b = el('button'); b.dataset.k = k; b.append(document.createTextNode(t + ' '), el('span', null, String(rows.filter(fn).length)));
    b.onclick = () => { state.chip = k; state.shown = PAGE; render(); };
    $('chips').append(b);
  }
  $('q').addEventListener('input', e => { state.q = e.target.value.trim(); state.shown = PAGE; render(); });
  $('sort').addEventListener('change', e => { state.sort = e.target.value; render(); });
  $('more').onclick = () => { state.shown += PAGE; render(); };

  const SORTS = {
    /* 거래 3건 미만은 중앙값이 흔들리므로 평당가 순위에서는 뒤로 */
    pp: (a, b) => (b.all.n >= 3) - (a.all.n >= 3) || b.all.pp - a.all.pp, n: (a, b) => b.c.T.length - a.c.T.length,
    st: (a, b) => (a.st ? a.st.d : 1e9) - (b.st ? b.st.d : 1e9), new: (a, b) => (b.by || 0) - (a.by || 0), jr: (a, b) => b.all.jr - a.all.jr,
  };

  function card(r) {
    const { c, all, st, last } = r, li = el('li', 'cardItem');
    const reg = c.reg || {};
    const sub = [c.dong, r.by ? `${r.by}년 준공(${r.age}년차)` : '', reg.hh ? reg.hh.toLocaleString() + '세대' : ''].filter(Boolean).join(' · ');
    li.append(el('h3', null, c.name), el('p', 'sub', sub));
    const k = el('div', 'k');
    const box = (label, val, note) => { const d = el('div'); d.append(el('small', null, label), el('b', null, val)); if (note) d.append(el('em', null, note)); k.append(d); };
    box('평당가', all.n ? won(all.pp) : '-', all.n ? `${all.n}건 중앙값` : '매매 없음');
    box('최근 매매', last ? won(last[3]) : '-', last ? `${last[1].toFixed(0)}㎡ · ${String(last[0]).slice(2, 4)}.${String(last[0]).slice(4, 6)}` : '');
    box('전세가율', all.jr ? all.jr + '%' : '-', all.jr >= 70 ? '갭 위험 주의' : all.nj ? `전세 ${all.nj}건` : '');
    li.append(k);
    if (st) li.append(el('p', 'st', `🚇 ${st.n} 도보 약 ${walkMin(st.d, CFG.walkSpeed)}분 (직선 ${Math.round(st.d)} m)`));
    const act = el('div', 'act'), a = el('a', 'go3d', '3D로 보기');
    a.href = './?focus=' + encodeURIComponent(c.id);
    act.append(a);
    const ct = contactRow(c.name); if (ct.childNodes.length) act.append(...ct.childNodes);
    li.append(act);
    return li;
  }

  function render() {
    $('chips').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.k === state.chip));
    const fn = CHIPS.find(x => x[0] === state.chip)[2], q = state.q.toLowerCase();
    const list = rows.filter(fn).filter(r => !q || (r.c.name + ' ' + r.c.dong).toLowerCase().includes(q)).sort(SORTS[state.sort]);
    $('count').textContent = `${list.length.toLocaleString()}곳`;
    const ol = $('cards'); ol.textContent = '';
    for (const r of list.slice(0, state.shown)) ol.append(card(r));
    $('more').hidden = list.length <= state.shown;
  }
  render();

  /* ---------- 출처 ---------- */
  const f = $('foot');
  f.append(el('p', null, `자료: ${RD.meta.src}. 지도 © OpenStreetMap 기여자(ODbL).`));
  const cr = el('p'); const a1 = el('a', null, 'GPT PARK · OSM Real Buildings 3D Town'); a1.href = 'https://github.com/muzbox1973/osm-real-buildings-3d-town'; a1.target = '_blank'; a1.rel = 'noopener';
  cr.append(document.createTextNode('원작: '), a1, document.createTextNode(' (MIT)'));
  f.append(cr, el('p', null, `데이터 기준: ${RD.meta.at.slice(0, 10)}`));

  /* ---------- 홈 화면에 추가 ---------- */
  let deferred = null;
  const btn = $('install');
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; btn.hidden = false; });
  btn.onclick = async () => {
    if (deferred) { deferred.prompt(); await deferred.userChoice; deferred = null; btn.hidden = true; return; }
    let tip = document.getElementById('installTip');
    if (!tip) { tip = el('p', 'notice tip'); tip.id = 'installTip'; $('notice').after(tip); }
    tip.textContent = '아이폰: Safari 아래 [공유] 버튼 → [홈 화면에 추가]를 누르세요. 안드로이드: 크롬 오른쪽 위 ⋮ → [홈 화면에 추가].';
    tip.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  if (/iphone|ipad/i.test(navigator.userAgent) && !navigator.standalone) btn.hidden = false;
})();
