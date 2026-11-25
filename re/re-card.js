/* 단지 정보 카드: 건축물대장 개요 · 실거래 요약 · 12개월 시세 그래프 · 최근 거래 · 가까운 역 */
(() => {
  const RE = window.RE = window.RE || {};
  const CFG = window.RE_CONFIG || {};
  let card = null, cur = null;

  const fmtDate = d => { const s = String(d); return `${s.slice(2, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}`; };
  const useYear = s => (s && s.length >= 4 ? s.slice(0, 4) : '');

  function ensureCard() {
    if (card) return card;
    card = RE.el('aside', 're-card'); card.id = 'reCard'; card.setAttribute('aria-live', 'polite');
    document.body.append(card);
    addEventListener('keydown', e => { if (e.key === 'Escape' && cur && !document.body.classList.contains('present')) RE.closeCard(); });
    return card;
  }

  function row(dl, k, v) { if (v === '' || v == null) return; dl.append(RE.el('dt', null, k), RE.el('dd', null, v)); }

  function render(c) {
    const el = RE.el, won = RE.won, st = RE.statsFor(c, RE.state.band), all = RE.statsFor(c, 'all'), reg = c.reg || {};
    card.textContent = '';
    const close = el('button', 're-x', '×'); close.setAttribute('aria-label', '닫기'); close.onclick = RE.closeCard;
    const head = el('header');
    head.append(el('h2', null, c.name), el('p', null, `${c.sgg} ${c.dong} ${c.jibun}${reg.addr ? ' · ' + reg.addr.replace(/^서울특별시\s*/, '') : c.road ? ' · ' + c.road : ''}`));
    card.append(close, head);

    /* 핵심 숫자 */
    const kpi = el('div', 're-kpi');
    const box = (label, val, sub) => { const b = el('div'); b.append(el('small', null, label), el('b', null, val)); if (sub) b.append(el('em', null, sub)); kpi.append(b); };
    box('평당가 중앙값', st.n ? won(st.pp) : '-', `${RE.BANDS[RE.state.band][0]} · ${st.n}건`);
    box('전세가율', st.jr ? st.jr + '%' : '-', st.jr >= 70 ? '갭 위험 주의' : st.jr ? '전세 ' + won(st.jpp) + '/평' : '');
    box('최근 변동', st.chg == null ? '-' : (st.chg > 0 ? '+' : '') + st.chg + '%', '후반 vs 전반 6개월');
    card.append(kpi);

    /* 그래프 */
    card.append(chart(c));

    /* 단지 개요 (건축물대장) */
    const dl = el('dl', 're-dl');
    const yr = useYear(reg.use) || c.by;
    row(dl, '준공', yr ? `${yr}년 (${new Date().getFullYear() - yr}년차)` : '');
    row(dl, '세대수', reg.hh ? reg.hh.toLocaleString() + '세대' : '');
    row(dl, '동 수', reg.bld ? reg.bld + '개 동' : '');
    row(dl, '주차', reg.park ? `${reg.park.toLocaleString()}대${reg.hh ? ` (세대당 ${(reg.park / reg.hh).toFixed(2)}대)` : ''}` : '');
    row(dl, '용적률 · 건폐율', reg.far ? `${Math.round(reg.far)}% · ${Math.round(reg.bcr)}%` : '');
    if (c.st) { const m = Math.round(c.st.d * 1.25 / (CFG.walkSpeed || 75)); row(dl, '가까운 역', `${c.st.s.name} 직선 ${Math.round(c.st.d)} m · 도보 약 ${m}분`); }
    row(dl, '12개월 거래', `매매 ${all.n}건 · 전월세 ${c.R.length}건`);
    /* c.reg: undefined = 아직 안 받음(실시간 모드에서 거래 적은 단지), null·빈값 = 대장에 총괄표제부 없음 */
    if (c.reg === undefined) row(dl, '참고', '거래가 적어 건축물대장은 불러오지 않았습니다.');
    else if (!reg.hh) row(dl, '참고', '건축물대장 총괄표제부가 없는 단지입니다(소규모·일반건축물).');
    card.append(dl);

    /* 최근 거래 */
    const recent = [...c.T].reverse().slice(0, 6);
    if (recent.length) {
      const tb = el('table', 're-tbl'), cap = el('caption', null, '최근 매매 실거래');
      tb.append(cap);
      for (const [d, a, f, p] of recent) { const tr = el('tr'); tr.append(el('td', null, fmtDate(d)), el('td', null, `${a.toFixed(0)}㎡ (${(a / 3.305785).toFixed(0)}평)`), el('td', null, f + '층'), el('td', 're-num', won(p))); tb.append(tr); }
      card.append(tb);
    }
    const foot = el('p', 're-foot', '자료: 국토교통부 실거래가 공개시스템·건축물대장(공공데이터포털). 신고 기준이며 계약 해제분은 뺐습니다. 참고용 정보입니다.');
    card.append(foot);
  }

  /* 12개월 시세 그래프 (SVG): 매매 = 채운 점, 전세 = 빈 점, 면적대별 색 */
  function chart(c) {
    const NS = 'http://www.w3.org/2000/svg', W = 340, H = 150, P = { l: 40, r: 8, t: 10, b: 22 };
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 're-chart'); svg.setAttribute('role', 'img');
    const T = c.T.map(t => ({ d: t[0], a: t[1], v: t[3], j: false })), J = c.R.filter(r => r[4] === 0).map(r => ({ d: r[0], a: r[1], v: r[3], j: true }));
    const pts = [...T, ...J];
    svg.setAttribute('aria-label', `${c.name} 매매 ${T.length}건, 전세 ${J.length}건 가격 분포`);
    if (!pts.length) { const t = document.createElementNS(NS, 'text'); t.setAttribute('x', W / 2); t.setAttribute('y', H / 2); t.setAttribute('text-anchor', 'middle'); t.textContent = '거래 없음'; svg.append(t); return svg; }
    const toT = d => { const s = String(d); return Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)); };
    const [m0, m1] = RE.data.meta.months, t0 = Date.UTC(+m0.slice(0, 4), +m0.slice(4) - 1, 1), t1 = Date.UTC(+m1.slice(0, 4), +m1.slice(4), 1);
    const vmax = Math.max(...pts.map(p => p.v)) * 1.08, X = d => P.l + (toT(d) - t0) / (t1 - t0) * (W - P.l - P.r), Y = v => H - P.b - v / vmax * (H - P.t - P.b);
    const mk = (tag, at) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); svg.append(e); return e; };
    for (let i = 0; i <= 4; i++) { const v = vmax * i / 4, y = Y(v); mk('line', { x1: P.l, x2: W - P.r, y1: y, y2: y, class: 'g' }); mk('text', { x: P.l - 4, y: y + 3, 'text-anchor': 'end', class: 'ax' }).textContent = RE.won(v); }
    for (let k = 0; k < 12; k += 3) { const d = new Date(t0); d.setUTCMonth(d.getUTCMonth() + k); const x = P.l + (d - t0) / (t1 - t0) * (W - P.l - P.r);
      mk('text', { x, y: H - 6, 'text-anchor': 'middle', class: 'ax' }).textContent = `${String(d.getUTCFullYear()).slice(2)}.${d.getUTCMonth() + 1}`; }
    const col = a => a <= 60 ? '#3182ce' : a <= 85 ? '#dd6b20' : '#805ad5';
    for (const p of pts) { const ok = RE.BANDS[RE.state.band][1](p.a);
      mk('circle', { cx: X(p.d), cy: Y(p.v), r: p.j ? 3 : 3.6, fill: p.j ? 'none' : col(p.a), stroke: col(p.a), 'stroke-width': 1.4, opacity: ok ? .9 : .15 }); }
    const lg = [['~60㎡', '#3182ce'], ['60~85㎡', '#dd6b20'], ['85㎡~', '#805ad5']];
    lg.forEach(([t, c2], i) => { mk('circle', { cx: P.l + 8 + i * 70, cy: P.t + 4, r: 3.5, fill: c2 }); mk('text', { x: P.l + 14 + i * 70, y: P.t + 7, class: 'ax' }).textContent = t; });
    mk('circle', { cx: P.l + 222, cy: P.t + 4, r: 3, fill: 'none', stroke: '#4a5568' }); mk('text', { x: P.l + 228, y: P.t + 7, class: 'ax' }).textContent = '전세';
    return svg;
  }

  RE.openCard = (c, fly = true) => {
    ensureCard(); if (cur && cur !== c && cur.mesh) cur.mesh.material.emissive.setHex(0); // 앞 단지 강조 끄기
    cur = c; RE.state.picked = c;
    render(c); card.classList.add('on');
    if (c.mesh) { c.mesh.material.emissiveIntensity = 1; c.mesh.material.emissive.setHex(0x333333); }
    if (fly && !document.body.classList.contains('present')) {
      const T = RE.T, d = T.camera.position.distanceTo(T.controls.target);
      RE.flyTo(c.x, c.z, Math.min(Math.max(d * .7, 350), 900), Math.atan2(T.camera.position.x - T.controls.target.x, T.camera.position.z - T.controls.target.z), .75, 1100);
    }
  };
  RE.closeCard = () => {
    if (!card) return;
    card.classList.remove('on'); if (cur && cur.mesh) cur.mesh.material.emissive.setHex(0); cur = null; RE.state.picked = null;
    RE.recolor();
  };
  RE.refreshCard = () => { if (cur && card && card.classList.contains('on')) render(cur); };
})();
