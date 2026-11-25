/* 강의용 발표 모드: 장면마다 카메라 이동 + 자막.  → / 스페이스: 다음 · ←: 이전 · Esc: 끝내기 */
(() => {
  const RE = window.RE = window.RE || {};
  const CFG = window.RE_CONFIG || {};
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let bar, idx = -1, scenes = [], timer = null, saved = null;

  /* ---------- 장면에 쓸 값 고르기 ---------- */
  function pickFacts() {
    const C = RE.C.filter(c => c.mesh), all = c => RE.statsFor(c, 'all'), m = c => RE.statsFor(c, 'm');
    const byPP = C.filter(c => all(c).n >= 3).sort((a, b) => all(b).pp - all(a).pp);
    const byJR = C.filter(c => all(c).nj >= 3 && all(c).n >= 3).sort((a, b) => all(b).jr - all(a).jr);
    const by84 = C.filter(c => m(c).n >= 2).sort((a, b) => m(b).pp - m(a).pp);
    const busiest = [...C].sort((a, b) => b.T.length - a.T.length)[0];
    /* 지도 중심 이름(예: 노량진역)과 같은 역, 없으면 중심에서 가장 가까운 역 */
    const center = String(RE.data.meta.center || '').replace(/역$/, '');
    const st = (center && RE.stations.find(s => s.name.includes(center))) || [...RE.stations].sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
    const b63 = RE.D.B.find(b => /63\s*(빌딩|스퀘어|square)/i.test(b[2] || ''));
    let lm = null;
    if (b63) { let x = 0, z = 0; const f = b63[3]; for (let i = 0; i < f.length; i += 2) { x += f[i]; z += f[i + 1]; } lm = { name: '63스퀘어', x: x / (f.length / 2), z: z / (f.length / 2) }; }
    const nT = RE.C.reduce((s, c) => s + c.T.length, 0), nR = RE.C.reduce((s, c) => s + c.R.length, 0);
    return { top: byPP[0], jr: byJR[0], top84: by84.slice(0, 3), busiest, st, lm, nT, nR, nB: RE.D.B.length };
  }
  const walkMin = d => Math.round(d * 1.25 / (CFG.walkSpeed || 75));

  function buildScenes() {
    const F = pickFacts(), T = RE.T, won = RE.won, o = RE.office;
    const list = [
      { t: CFG.title || '3D 부동산 지도', s: `실제 지도(OpenStreetMap) 건물 ${F.nB.toLocaleString()}채 위에 국토교통부 실거래 ${(F.nT + F.nR).toLocaleString()}건을 올렸습니다.`,
        go: async () => { RE.setMode('pp'); RE.setBand('all'); RE.setRings(false); T.home(); T.controls.autoRotate = true; } },
    ];
    if (o) list.push({ t: '우리 사무소에서 시작합니다', s: `${CFG.office.label || o.name}${F.st ? ` · ${F.st.name}까지 도보 약 ${walkMin(Math.hypot(o.x - F.st.x, o.z - F.st.z))}분` : ''}`,
      go: async () => { T.controls.autoRotate = false; await RE.flyTo(o.x, o.z, 420, .5, .7); } });
    list.push({ t: '색 = 최근 12개월 평당가', s: '단지마다 실거래 중앙값으로 칠했습니다. 파란색은 낮고, 빨간색일수록 비쌉니다.',
      go: async () => { T.controls.autoRotate = false; RE.setMode('pp'); await RE.flyTo(0, 0, 2600, .4, .95); } });
    if (F.top) list.push({ t: `반경 ${RE.data.meta.r / 1000} km 평당가 1위: ${F.top.name}`, s: `전용 3.3㎡당 ${won(RE.statsFor(F.top, 'all').pp)} · 최근 12개월 매매 ${F.top.T.length}건`,
      go: async alive => { await RE.flyTo(F.top.x, F.top.z, 520, 1.2, .6); if (alive()) RE.openCard(F.top, false); } });
    if (F.top84.length) list.push({ t: '국민평형(전용 60~85㎡)만 보면', s: F.top84.map((c, i) => `${i + 1}. ${c.name} ${won(RE.statsFor(c, 'm').pp)}`).join('   '),
      go: async () => { RE.closeCard(); RE.setBand('m'); await RE.flyTo(F.top84[0].x, F.top84[0].z, 1400, -.4, .8); } });
    if (F.jr) list.push({ t: `전세가율 ${RE.statsFor(F.jr, 'all').jr}%: ${F.jr.name}`, s: '전세가율 = 전세가 ÷ 매매가. 70%를 넘으면 갭투자·깡통전세 위험을 꼼꼼히 설명해야 합니다.',
      go: async alive => { RE.setBand('all'); RE.setMode('jr'); await RE.flyTo(F.jr.x, F.jr.z, 600, 2.2, .65); if (alive()) RE.openCard(F.jr, false); } });
    if (F.st) list.push({ t: `${F.st.name} 역세권`, s: `초록 원 도보 5분(${(CFG.walkRings || [400])[0]} m), 파란 원 도보 10분. 원 밖 단지는 흐리게 표시됩니다.`,
      go: async () => { RE.closeCard(); RE.setMode('pp'); RE.setRings(true); await RE.flyTo(F.st.x, F.st.z, 1500, .3, 1.0); } });
    if (F.lm) list.push({ t: '한강 건너 여의도', s: `${F.lm.name}까지 ${F.st ? F.st.name : '지도 중심'}에서 직선 ${(Math.hypot(F.lm.x - (F.st ? F.st.x : 0), F.lm.z - (F.st ? F.st.z : 0)) / 1000).toFixed(1)} km. 직주근접 입지를 한눈에 보여 줍니다.`,
      go: async () => { RE.setRings(false); await RE.flyTo(F.lm.x, F.lm.z, 900, 2.8, .45, 2400); } });
    list.push({ t: 'AI로 만든 우리 동네 3D 부동산 지도', s: '오픈소스 + 공공데이터 + AI. 공인중개사 누구나 자기 동네로 만들 수 있습니다.',
      go: async () => { RE.closeCard(); setNight(true); RE.setMode('pp'); T.home(); await sleep(50); T.controls.autoRotate = true; } });
    return list;
  }

  function setNight(on) {
    const b = document.getElementById('bNight');
    if (b && document.body.classList.contains('night') !== on) b.click();
    RE.recolor();
  }

  /* ---------- 자막 바 ---------- */
  function ensureBar() {
    if (bar) return;
    bar = RE.el('div', 're-sub'); bar.setAttribute('aria-live', 'polite');
    document.body.append(bar);
  }
  function render() {
    const s = scenes[idx]; bar.textContent = '';
    const nav = RE.el('div', 're-nav');
    const btn = (t, fn, label) => { const b = RE.el('button', null, t); b.setAttribute('aria-label', label); b.onclick = fn; nav.append(b); };
    btn('◀', prev, '이전 장면'); nav.append(RE.el('span', null, `${idx + 1} / ${scenes.length}`)); btn('▶', next, '다음 장면'); btn('✕', stop, '발표 끝내기');
    bar.append(RE.el('b', null, s.t), RE.el('p', null, s.s), nav);
  }
  /* 장면 번호표: 발표를 끝내거나 다른 장면으로 넘어가면 바뀌어, 진행 중이던 장면이 뒤늦게 화면을 바꾸지 못하게 한다 */
  let run = 0;
  async function go(i) {
    if (i < 0 || i >= scenes.length) return;
    const my = ++run;
    idx = i; render();
    try { await scenes[i].go(() => my === run); } catch (e) { console.error('[RE] 발표 장면 오류', e); }
    if (my !== run) return;
    clearTimeout(timer);
    if (CFG.tourAuto > 0) timer = setTimeout(() => (idx < scenes.length - 1 ? next() : stop()), CFG.tourAuto * 1000);
  }
  const next = () => go(Math.min(scenes.length - 1, idx + 1)), prev = () => go(Math.max(0, idx - 1));
  function onKey(e) {
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
    else if (e.key === 'Escape') stop();
  }

  function start() {
    if (!RE.C || document.body.classList.contains('driving')) return;
    saved = { mode: RE.state.mode, band: RE.state.band, rings: RE.state.rings, night: document.body.classList.contains('night') };
    scenes = buildScenes(); ensureBar();
    document.body.classList.add('present'); addEventListener('keydown', onKey);
    go(0);
  }
  function stop() {
    run++; RE.cancelFly && RE.cancelFly();
    clearTimeout(timer); removeEventListener('keydown', onKey);
    document.body.classList.remove('present'); if (bar) bar.textContent = '';
    RE.T.controls.autoRotate = false; RE.closeCard();
    if (saved) { setNight(saved.night); RE.setRings(saved.rings); RE.setBand(saved.band); RE.setMode(saved.mode); }
    RE.T.home();
  }
  RE.tour = { start, stop, next, prev };
  /* 주소창에 ?tour=1 을 붙이면 열리자마자 발표 모드 */
  RE.onReady = () => { if (new URLSearchParams(location.search).has('tour')) setTimeout(start, 800); };
})();
