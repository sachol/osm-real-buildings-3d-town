/* 부동산 레이어: 단지 시세 색칠 · 가격표 · 역세권 반경 · 사무소 핀 · 클릭 선택
   원본 앱이 열어 둔 window.town3d(장면·카메라·데이터)에 덧붙인다. 원본 코드는 건드리지 않는다. */
(() => {
  const CFG = window.RE_CONFIG || {};
  const RE = window.RE = window.RE || {};
  /* 공통 도구는 re-core.js */
  const { el, BANDS, statsFor } = RE;

  /* ---------- 색 ---------- */
  const SCALES = {
    pp: { name: '평당가 (전용, 만원/3.3㎡)', stops: ['#2b6cb0', '#63b3ed', '#f6e05e', '#ed8936', '#c53030'], fmt: v => Math.round(v).toLocaleString() + '만' },
    jr: { name: '전세가율 (%)', stops: ['#2f855a', '#9ae6b4', '#f6e05e', '#ed8936', '#c53030'], fmt: v => Math.round(v) + '%', fixed: [40, 80] },
    chg: { name: '최근 변동 (후반 6개월 vs 전반, %)', stops: ['#2b6cb0', '#90cdf4', '#edf2f7', '#feb2b2', '#c53030'], fmt: v => (v > 0 ? '+' : '') + v.toFixed(1) + '%', fixed: [-8, 8] },
  };
  RE.SCALES = SCALES;
  function lerpColor(stops, t) {
    const c = stops.map(s => new THREE.Color(s)), x = Math.max(0, Math.min(1, t)) * (c.length - 1), i = Math.min(c.length - 2, Math.floor(x));
    return c[i].clone().lerp(c[i + 1], x - i);
  }
  const NODATA = new THREE.Color('#a0aec0');

  /* ---------- 상태 ---------- */
  const state = { mode: CFG.defaultMode || 'pp', band: 'all', tags: true, rings: false, range: [0, 1], picked: null };
  RE.state = state;

  /* 미리 받은 데이터(re-data.js)가 이 지도와 같은 곳이면 바로, 아니면 실시간 불러오기(re-live.js)로 */
  function start() {
    const T = window.town3d, D = T.D, RD = window.RE_DATA;
    RE.T = T; RE.D = D;
    const same = RD && D.lat0 && Math.abs(RD.meta.lat0 - D.lat0) < 1e-4 && Math.abs(RD.meta.lon0 - D.lon0) < 1e-4;
    if (same) return boot(RD);
    /* 지도 자료(data.js)는 매달·코드 수정 때 자동으로 다시 만들어지는데, 그때 '노량진역' 주소 검색 결과가 조금씩 달라져
       지도 중심이 수십~수백 m 옮겨질 수 있다. 1.5 km 안쪽 차이면 부동산 자료를 그만큼 옮겨서 맞춘다(원본은 그대로 두고 새 객체로). */
    const moved = RD && D.lat0 && shiftTo(RD, D);
    if (moved) return boot(moved);
    if (RE.live && D.osm) return RE.live.begin();
    console.warn('[RE] 이 지도에 맞는 부동산 데이터가 없어 부동산 레이어를 켜지 않습니다.');
  }
  function shiftTo(RD, D) {
    const KX = 111320 * Math.cos(D.lat0 * Math.PI / 180), KZ = 110950;
    const dx = (RD.meta.lon0 - D.lon0) * KX, dz = (D.lat0 - RD.meta.lat0) * KZ;
    if (!Number.isFinite(dx) || Math.hypot(dx, dz) > 1500) return null;
    const mv = o => (o && Number.isFinite(o.x) ? { ...o, x: Math.round((o.x + dx) * 10) / 10, z: Math.round((o.z + dz) * 10) / 10 } : o);
    console.warn(`[RE] 지도 중심이 부동산 자료와 ${Math.round(Math.hypot(dx, dz))} m 달라 부동산 자료를 옮겨 맞춥니다.`);
    return { ...RD, meta: { ...RD.meta, lat0: D.lat0, lon0: D.lon0, shifted: [Math.round(dx), Math.round(dz)] },
      C: RD.C.map(mv), office: mv(RD.office), ST: (RD.ST || []).map(([n, x, z, ...r]) => [n, x + dx, z + dz, ...r]) };
  }
  function boot(RD) {
    const T = RE.T, D = RE.D;
    RE.data = RD; RE.C = RD.C;
    document.body.classList.add('re-on');
    brandCard(RD);
    buildOverlay(T, D, RD.C);
    buildOffice(T, RD.office);
    buildRings(T, D);
    buildPanel();
    bindPick(T);
    recolor();
    requestAnimationFrame(loop);
    if (RE.onReady) RE.onReady();
    /* 주소창 ?focus=단지키 : 브리핑 페이지의 [3D로 보기]에서 넘어온 경우 그 단지를 연다 */
    const focus = new URLSearchParams(location.search).get('focus');
    const fc = focus && RE.C.find(c => c.id === focus);
    if (fc) setTimeout(() => RE.openCard(fc), 700);
  }
  RE.boot = boot;

  /* ---------- 왼쪽 카드 문구 ---------- */
  function brandCard(RD) {
    const card = document.querySelector('.card');
    if (!card) return;
    /* 제목은 늘 같게, 지금 보는 동네는 제목 아래 한 줄로 */
    const h1 = card.querySelector('h1'), title = CFG.title || '3D 부동산 지도';
    h1.textContent = title; document.title = title;
    /* 실시간 모드에서는 주소 검색이 가게 이름 등을 돌려줄 수 있어, 사용자가 적은 주소를 그대로 쓴다 */
    const typed = RD.meta.live ? (new URLSearchParams(location.search).get('addr') || '').trim().slice(0, 60) : '';
    const place = typed || (RD.meta.live ? RE.D.place : RD.meta.center) || RE.D.place || '우리 동네';
    let pl = card.querySelector('.re-place');
    if (!pl) { pl = el('div', 're-place'); h1.after(pl); }
    pl.textContent = `📍 ${place} · 반경 ${RD.meta.r / 1000} km`;
    const nT = RD.C.reduce((s, c) => s + c.T.length, 0), nR = RD.C.reduce((s, c) => s + c.R.length, 0);
    const m = RD.meta.months.map(s => s.slice(0, 4) + '.' + s.slice(4));
    card.querySelector('p').textContent = `${CFG.subtitle || ''} · 반경 ${RD.meta.r / 1000} km 안 아파트 ${RD.C.length.toLocaleString()}곳, ` +
      `매매 ${nT.toLocaleString()}건 · 전월세 ${nR.toLocaleString()}건 (${m[0]}~${m[1]} 신고분)`;
    if (CFG.brand) card.insertBefore(el('div', 're-brand', '제작: ' + CFG.brand), card.querySelector('.row'));
    const credit = document.getElementById('credit');
    if (credit) credit.appendChild(el('span', 're-src', ' · 실거래가·건축물대장: 국토교통부(공공데이터포털, 공공누리 제1유형)'));
  }

  /* ---------- 단지 건물 덧칠 ---------- */
  function osmFloors(t, lv, ar) { if (lv) return lv; return t === 'a' ? 15 : t === 'c' ? (ar > 2500 ? 5 : 4) : t === 's' ? 4 : t === 'h' ? 7 : t === 'i' ? 2 : t === 'd' ? 2 : t === 'v' ? 4 : t === 'g' ? 2 : t === 'p' ? 3 : ar < 100 ? 1 : ar < 400 ? 2 : 3; }
  const areaOf = f => { let s = 0; for (let i = 0; i < f.length; i += 2) { const j = (i + 2) % f.length; s += f[i] * f[j + 1] - f[j] * f[i + 1]; } return Math.abs(s / 2); };
  const cen = f => { let x = 0, z = 0; for (let i = 0; i < f.length; i += 2) { x += f[i]; z += f[i + 1]; } return [x / (f.length / 2), z / (f.length / 2)]; };
  const pip = (x, z, f) => { let c = false; for (let i = 0, j = f.length - 2; i < f.length; j = i, i += 2) { const xi = f[i], zi = f[i + 1], xj = f[j], zj = f[j + 1]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
  function topOf(b) { const t = b[0], ar = areaOf(b[3]); return b[4] || osmFloors(t, b[1], ar) * (t === 'a' ? 2.9 : t === 'i' ? 4.5 : 3.3); }

  function extrudeFoot(f, h) {
    const [cx, cz] = cen(f), k = 1.025, s = new THREE.Shape();
    for (let i = 0; i < f.length; i += 2) { const x = cx + (f[i] - cx) * k, z = cz + (f[i + 1] - cz) * k; i ? s.lineTo(x, -z) : s.moveTo(x, -z); }
    const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    return g.index ? g.toNonIndexed() : g;
  }
  function mergeGeoms(list) {
    let n = 0; for (const g of list) n += g.attributes.position.count;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3); let o = 0;
    for (const g of list) { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; g.dispose(); }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    return out;
  }

  function buildOverlay(T, D, C) {
    const res = (D.A || []).filter(a => a[0] === 'residential' && areaOf(a[2]) < 400000);
    const blds = D.B.filter(b => !b[8] && !T.HIDE.has(b) && (b[0] === 'a' || (b[1] || 0) >= 5)).map(b => ({ b, c: cen(b[3]), used: false }));
    const group = new THREE.Group(); group.name = 're-overlay'; T.scene.add(group);
    RE.group = group; RE.meshes = [];
    for (const c of C) {
      const poly = res.find(a => pip(c.x, c.z, a[2]));
      let mine = poly ? blds.filter(o => !o.used && pip(o.c[0], o.c[1], poly[2])) : [];
      if (!mine.length) mine = blds.filter(o => !o.used && Math.hypot(o.c[0] - c.x, o.c[1] - c.z) < 70);
      mine.forEach(o => { o.used = true; });
      const mat = new THREE.MeshLambertMaterial({ color: NODATA.clone(), transparent: true, opacity: .93 });
      let mesh, top = 30;
      if (mine.length) {
        const geoms = [];
        for (const o of mine) { const h = topOf(o.b) + .6; top = Math.max(top, h); try { geoms.push(extrudeFoot(o.b[3], h)); } catch (e) { console.warn('[RE] 건물 모양 오류', c.name, e.message); } }
        if (!geoms.length) continue;
        mesh = new THREE.Mesh(mergeGeoms(geoms), mat);
      } else {
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 40, 6), mat); mesh.position.set(c.x, 20, c.z); top = 42;
      }
      mesh.userData.c = c; c.mesh = mesh; c.top = top; c.nb = mine.length;
      group.add(mesh); RE.meshes.push(mesh);
      c.tag = el('div', 're-tag'); c.tag.style.display = 'none'; c.tagOn = false;
      document.getElementById('labels').appendChild(c.tag);
    }
  }

  /* ---------- 색 다시 칠하기 ---------- */
  function valueOf(c) { const s = statsFor(c, state.band); c.cur = s; return state.mode === 'pp' ? (s.n ? s.pp : null) : state.mode === 'jr' ? (s.jr || null) : s.chg; }
  function recolor() {
    const sc = SCALES[state.mode], vals = [];
    for (const c of RE.C) { const v = valueOf(c); c.val = v; if (v != null) vals.push(v); }
    vals.sort((a, b) => a - b);
    state.range = sc.fixed || [vals[Math.floor(vals.length * .05)] || 0, vals[Math.floor(vals.length * .95)] || 1];
    const [lo, hi] = state.range;
    for (const c of RE.C) {
      if (!c.mesh) continue;
      const col = c.val == null ? NODATA : lerpColor(sc.stops, (c.val - lo) / (hi - lo || 1));
      c.mesh.material.color.copy(col); c.mesh.material.emissive.copy(col).multiplyScalar(document.body.classList.contains('night') ? .45 : 0);
      c.tag.textContent = ''; c.tag.append(el('b', null, c.name.length > 11 ? c.name.slice(0, 10) + '…' : c.name), el('span', null, c.val == null ? '거래 없음' : sc.fmt(c.val)));
      c.tag.style.borderColor = '#' + col.getHexString();
    }
    drawLegend();
    if (RE.refreshCard) RE.refreshCard();
  }
  RE.recolor = recolor;
  RE.setMode = m => { state.mode = m; syncPanel(); recolor(); };
  RE.setBand = b => { state.band = b; syncPanel(); recolor(); };

  /* ---------- 사무소 핀 ---------- */
  function buildOffice(T, o) {
    if (!o || !CFG.office || !CFG.office.show || !o.how) return;
    const g = new THREE.Group(), red = new THREE.MeshLambertMaterial({ color: 0xe53e3e, emissive: 0xe53e3e, emissiveIntensity: .35 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 70, 10), red); pole.position.y = 35;
    const head = new THREE.Mesh(new THREE.SphereGeometry(9, 20, 14), red); head.position.y = 78;
    const ring = new THREE.Mesh(new THREE.RingGeometry(14, 18, 48), new THREE.MeshBasicMaterial({ color: 0xe53e3e, transparent: true, opacity: .6, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .8;
    g.add(pole, head, ring); g.position.set(o.x, 0, o.z); T.scene.add(g);
    RE.office = { ...o, g, ring, tag: el('div', 're-office', '★ ' + (CFG.office.label || o.name)) };
    document.getElementById('labels').appendChild(RE.office.tag);
  }

  /* ---------- 역세권 반경 ---------- */
  function buildRings(T, D) {
    const R = D.r || 3000, seen = [], g = new THREE.Group(); g.visible = false; T.scene.add(g);
    RE.stations = [];
    for (const [name, x, z, kind] of D.ST || []) {
      if (Math.hypot(x, z) > R * 1.02 || /bus|tram/.test(kind || '')) continue;
      const nm = (name || '역').replace(/\(.*\)/, '').trim(), full = nm.endsWith('역') ? nm : nm + '역';
      if (seen.some(s => s.name === full && Math.hypot(s.x - x, s.z - z) < 400)) continue;
      seen.push({ name: full, x, z }); RE.stations.push({ name: full, x, z });
      (CFG.walkRings || [400, 800]).forEach((r, i) => {
        const m = new THREE.Mesh(new THREE.RingGeometry(r - 3, r + 3, 96), new THREE.MeshBasicMaterial({ color: i ? 0x3182ce : 0x2f855a, transparent: true, opacity: .75, side: THREE.DoubleSide, depthWrite: false }));
        m.rotation.x = -Math.PI / 2; m.position.set(x, 1.2 + i * .1, z); g.add(m);
      });
    }
    RE.ringGroup = g;
    for (const c of RE.C) { let best = null; for (const s of RE.stations) { const d = Math.hypot(s.x - c.x, s.z - c.z); if (!best || d < best.d) best = { s, d }; } c.st = best; }
  }
  RE.setRings = on => {
    state.rings = on; RE.ringGroup.visible = on; syncPanel();
    const lim = (CFG.walkRings || [400, 800]).at(-1);
    for (const c of RE.C) if (c.mesh) c.mesh.material.opacity = on && (!c.st || c.st.d > lim) ? .28 : .93;
  };

  /* ---------- 오른쪽 패널 ---------- */
  let panel, legend;
  function buildPanel() {
    panel = el('div', 're-panel'); panel.id = 'rePanel';
    const head = el('div', 're-head'); head.append(el('b', null, '부동산 레이어'));
    const fold = el('button', 're-fold', '접기'); fold.onclick = () => { panel.classList.toggle('folded'); fold.textContent = panel.classList.contains('folded') ? '펴기' : '접기'; };
    head.append(fold); panel.append(head);
    const body = el('div', 're-body');
    const seg = (label, items, cur, fn) => { const box = el('div', 're-seg'); box.setAttribute('role', 'group'); box.setAttribute('aria-label', label);
      for (const [k, t] of items) { const b = el('button', null, t); b.dataset.k = k; b.onclick = () => fn(k); box.append(b); } body.append(el('small', null, label), box); return box; };
    seg('색으로 보기', [['pp', '평당가'], ['jr', '전세가율'], ['chg', '최근 변동']], state.mode, RE.setMode).classList.add('re-mode');
    seg('전용면적', Object.entries(BANDS).map(([k, v]) => [k, v[0]]), state.band, RE.setBand).classList.add('re-band');
    const tg = el('div', 're-seg');
    const bRing = el('button', null, '역세권 반경'); bRing.id = 'reRing'; bRing.onclick = () => RE.setRings(!state.rings);
    const bTag = el('button', null, '가격표'); bTag.id = 'reTag'; bTag.onclick = () => { state.tags = !state.tags; syncPanel(); };
    const bTour = el('button', 're-tour-btn', '▶ 발표 모드'); bTour.onclick = () => RE.tour && RE.tour.start();
    tg.append(bRing, bTag, bTour); body.append(el('small', null, '보기'), tg);
    legend = el('div', 're-legend'); body.append(legend);
    body.append(el('p', 're-note', '건물을 클릭하면 단지 정보가 나옵니다. 색은 최근 12개월 신고된 실거래의 중앙값입니다.'));
    if (!RE.data.meta.live) { const a = el('a', 're-brief', '📱 단지 목록·모바일 브리핑 보기'); a.href = 'brief.html'; body.append(a); }
    panel.append(body); document.body.append(panel);
    syncPanel();
  }
  function syncPanel() {
    if (!panel) return;
    panel.querySelectorAll('.re-mode button').forEach(b => b.setAttribute('aria-pressed', b.dataset.k === state.mode));
    panel.querySelectorAll('.re-band button').forEach(b => b.setAttribute('aria-pressed', b.dataset.k === state.band));
    panel.querySelector('#reRing').setAttribute('aria-pressed', state.rings);
    panel.querySelector('#reTag').setAttribute('aria-pressed', state.tags);
  }
  function drawLegend() {
    if (!legend) return;
    const sc = SCALES[state.mode], [lo, hi] = state.range;
    legend.textContent = '';
    const bar = el('i'); bar.style.background = `linear-gradient(90deg,${sc.stops.join(',')})`;
    const ticks = el('div', 're-ticks'); ticks.append(el('span', null, sc.fmt(lo)), el('span', null, sc.fmt((lo + hi) / 2)), el('span', null, sc.fmt(hi)));
    const nd = el('em', null, '회색: 이 조건의 거래 없음');
    legend.append(el('b', null, sc.name + (state.band !== 'all' ? ' · ' + BANDS[state.band][0] : '')), bar, ticks, nd);
  }

  /* ---------- 클릭으로 단지 고르기 ---------- */
  function bindPick(T) {
    const cv = document.querySelector('#stage canvas'), ray = new THREE.Raycaster();
    let down = null;
    cv.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
    cv.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
      if (document.body.classList.contains('driving') || document.getElementById('toast').style.display === 'block') return;
      const rc = cv.getBoundingClientRect();
      ray.setFromCamera({ x: (e.clientX - rc.left) / rc.width * 2 - 1, y: -(e.clientY - rc.top) / rc.height * 2 + 1 }, T.camera);
      const hit = ray.intersectObjects(RE.meshes.filter(m => m.visible), false)[0];
      if (hit) RE.openCard && RE.openCard(hit.object.userData.c); else RE.closeCard && RE.closeCard();
    });
  }

  /* ---------- 카메라 이동 ---------- */
  let fly = null;
  RE.flyTo = (x, z, dist = 600, az = .6, el2 = .9, ms = 1800) => {
    const T = RE.T, cam = T.camera, ctl = T.controls;
    const to = new THREE.Vector3(x, 0, z), pos = new THREE.Vector3(x + Math.sin(az) * Math.cos(el2) * dist, Math.sin(el2) * dist, z + Math.cos(az) * Math.cos(el2) * dist);
    if (fly) fly.done(); // 앞선 이동은 여기서 끝난 것으로 처리 (기다리던 쪽이 멈추지 않게)
    fly = { t0: performance.now(), ms, p0: cam.position.clone(), q0: ctl.target.clone(), p1: pos, q1: to };
    return new Promise(r => { fly.done = r; });
  };
  RE.cancelFly = () => { if (fly) { const d = fly.done; fly = null; d(); } };
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  /* ---------- 매 프레임 ---------- */
  const pv = new THREE.Vector3();
  function loop(now) {
    requestAnimationFrame(loop);
    const T = RE.T, cam = T.camera;
    if (fly) {
      const t = Math.min(1, (now - fly.t0) / fly.ms), k = ease(t);
      cam.position.lerpVectors(fly.p0, fly.p1, k); T.controls.target.lerpVectors(fly.q0, fly.q1, k);
      if (t >= 1) { const d = fly.done; fly = null; d(); }
    }
    const xray = document.getElementById('bSub')?.getAttribute('aria-pressed') === 'true', driving = document.body.classList.contains('driving');
    RE.group.visible = !xray;
    if (RE.office) { const s = 1 + .25 * Math.sin(now / 300); RE.office.ring.scale.set(s, s, s); }
    placeTags(cam, xray || driving);
  }
  function placeTags(cam, hide) {
    const W = innerWidth, H = innerHeight, occ = [], cand = [];
    const show = (tag, on) => { if (on !== tag.on) { tag.style.display = on ? '' : 'none'; tag.on = on; } };
    if (RE.office) { pv.set(RE.office.x, 95, RE.office.z).project(cam); const ok = !hide && pv.z < 1 && Math.abs(pv.x) < 1.02 && Math.abs(pv.y) < 1.02;
      show(RE.office.tag, ok); if (ok) { const x = (pv.x + 1) / 2 * W, y = (1 - pv.y) / 2 * H; RE.office.tag.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`; occ.push([x - 90, y - 30, x + 90, y]); } }
    for (const c of RE.C) {
      if (!c.tag) continue;
      if (hide || !state.tags || c.val == null) { show(c.tag, false); continue; }
      pv.set(c.x, c.top + 8, c.z).project(cam);
      if (pv.z >= 1 || Math.abs(pv.x) > 1 || Math.abs(pv.y) > 1) { show(c.tag, false); continue; }
      const sx = (pv.x + 1) / 2 * W, sy = (1 - pv.y) / 2 * H;
      const d = Math.hypot(cam.position.x - c.x, cam.position.y, cam.position.z - c.z);
      cand.push([c, sx, sy, (c.cur.n + 2) / (1 + d * d / 4e5) * (c === state.picked ? 1e6 : 1)]);
    }
    /* 멀리서 내려다볼수록 가격표 수를 줄인다(읽기 쉽고 화면도 가벼움). 가까이 가면 최대 45개.
       줄일 때는 값이 높은 단지(평당가 상위 등)를 먼저 남겨 '이 동네 대장 단지'가 보이게 한다 */
    const camD = RE.T ? cam.position.distanceTo(RE.T.controls.target) : 0;
    const maxTags = camD ? Math.max(12, Math.min(45, Math.round(45 * 1800 / camD))) : 45;
    if (maxTags < 45 && cand.length) {
      const vmax = Math.max(...cand.map(q => q[0].val)) || 1;
      for (const q of cand) q[3] *= 1 + 3 * Math.max(0, q[0].val) / vmax;
    }
    cand.sort((a, b) => b[3] - a[3]);
    let n = 0;
    for (const [c, x, y] of cand) {
      const w = 96, r = [x - w / 2, y - 38, x + w / 2, y];
      if (n >= maxTags || occ.some(o => r[0] < o[2] && r[2] > o[0] && r[1] < o[3] && r[3] > o[1])) { show(c.tag, false); continue; }
      occ.push(r); n++; show(c.tag, true); c.tag.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
    }
  }

  /* 원본 앱 준비를 기다렸다가 시작 */
  const t0 = Date.now(), wait = setInterval(() => {
    if (window.town3d && window.THREE) { clearInterval(wait); try { start(); } catch (e) { console.error('[RE] 부동산 레이어 시작 실패', e); } }
    else if (Date.now() - t0 > 180000) { clearInterval(wait); console.warn('[RE] 3D 장면이 준비되지 않아 부동산 레이어를 켜지 못했습니다.'); }
  }, 300);
})();
