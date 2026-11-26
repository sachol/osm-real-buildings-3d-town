/* ===== ⚖ 단지 나란히 비교 =====
   단지 카드의 [⚖ 비교에 담기]로 최대 3곳을 담고, 화면 아래 비교함의 [나란히 보기]를 누르면
   지도는 담은 단지가 모두 보이게 움직이고, 아래쪽 큰 표에서 항목별로 나란히 비교한다.
   - 항목마다 '유리한 쪽'에 ★ (가격·변동은 좋고 나쁨이 손님마다 달라 표시하지 않음)
   - 열려 있는 동안 🏠 내 매물 자동 소개는 쉰다(body.cmp-open). 대기 화면이 켜지면 닫힌다.
   - 담은 단지는 이 브라우저 탭에서만 기억한다(새로 고침하면 비워짐). */
(() => {
  const RE = window.RE = window.RE || {};
  const CFG = window.RE_CONFIG || {};
  const body = document.body, el = RE.el, MAX = 3, PY = 3.305785, NUM = ['①', '②', '③'];
  let picks = []; // 단지 id

  const byId = id => (RE.C || []).find(c => c.id === id);
  const picked = () => picks.map(byId).filter(Boolean);
  const has = c => picks.includes(c.id);

  /* ---------- 카드 버튼 ---------- */
  function cardButton() {
    const card = document.getElementById('reCard'), c = RE.state && RE.state.picked;
    if (!card || !c) return;
    let b = card.querySelector('.re-cmp-add');
    if (!b) { b = el('button', 're-cmp-add'); b.type = 'button'; const h = card.querySelector('header'); (h || card).append(b); }
    const on = has(c), full = !on && picks.length >= MAX;
    b.textContent = on ? '✓ 비교함에 담김 (빼기)' : full ? `비교함이 가득 찼습니다 (${MAX}곳)` : '⚖ 비교에 담기';
    b.classList.toggle('on', on); b.disabled = full;
    b.onclick = () => { toggle(c); };
  }
  for (const k of ['openCard', 'refreshCard']) {
    const f = RE[k]; if (typeof f !== 'function') continue;
    RE[k] = (...a) => { const r = f(...a); cardButton(); return r; };
  }

  function toggle(c) {
    picks = has(c) ? picks.filter(id => id !== c.id) : picks.length < MAX ? [...picks, c.id] : picks;
    cardButton(); drawTray();
    if (sheet.classList.contains('on')) picks.length >= 2 ? drawSheet() : close();
  }

  /* ---------- 비교함 (화면 아래) ---------- */
  const tray = el('div', 're-cmp-tray'); tray.hidden = true;
  body.append(tray);
  function drawTray() {
    const P = picked();
    tray.textContent = ''; tray.hidden = !P.length;
    if (!P.length) return;
    tray.append(el('b', null, `⚖ 비교 ${P.length}/${MAX}`));
    for (const c of P) {
      const chip = el('span', 're-cmp-chip', c.name), x = el('button', null, '×');
      x.type = 'button'; x.setAttribute('aria-label', c.name + ' 비교에서 빼기'); x.onclick = () => toggle(c);
      chip.append(x); tray.append(chip);
    }
    const go = el('button', 're-cmp-go', P.length >= 2 ? '나란히 보기' : '1곳 더 담아 주세요');
    go.type = 'button'; go.disabled = P.length < 2; go.onclick = open;
    const clr = el('button', 're-cmp-clr', '비우기'); clr.type = 'button';
    clr.onclick = () => { picks = []; close(); drawTray(); cardButton(); };
    tray.append(go, clr);
  }

  /* ---------- 나란히 보기 (아래쪽 큰 표) ---------- */
  const sheet = el('section', 're-cmp'); sheet.setAttribute('aria-label', '단지 나란히 비교');
  body.append(sheet);

  const near = (a, t) => Math.abs(a - t) <= 3;
  function sizeMed(c, t) { const ps = c.T.filter(x => near(x[1], t)).map(x => x[3]); return ps.length ? { m: RE.median(ps), n: ps.length } : null; }

  /* 행: [제목, 값 계산(c)→{v:비교용 숫자, t:보여줄 글, s:작은 글}, 유리한 방향(+1 클수록, -1 작을수록, 0 표시 안 함)] */
  function rows() {
    const band = RE.state.band, bl = RE.BANDS[band][0], yr = new Date().getFullYear();
    return [
      ['평당가 중앙값', c => { const s = RE.statsFor(c, band); return s.n ? { v: s.pp, t: RE.won(s.pp), s: `${bl} · ${s.n}건` } : null; }, 0],
      ['59㎡형 매매', c => { const r = sizeMed(c, 59); return r && { v: r.m, t: RE.won(r.m), s: `중앙값 · ${r.n}건` }; }, 0],
      ['84㎡형 매매', c => { const r = sizeMed(c, 84); return r && { v: r.m, t: RE.won(r.m), s: `중앙값 · ${r.n}건` }; }, 0],
      ['전세가율', c => { const s = RE.statsFor(c, band); return s.jr ? { v: s.jr, t: s.jr + '%', s: s.jr >= 70 ? '갭 위험 주의' : '' } : null; }, -1],
      ['최근 변동', c => { const s = RE.statsFor(c, band); return s.chg == null ? null : { v: s.chg, t: (s.chg > 0 ? '+' : '') + s.chg + '%', s: '후반 vs 전반 6개월', cls: s.chg >= 1 ? 'up' : s.chg <= -1 ? 'down' : '' }; }, 0],
      ['준공', c => { const y = RE.builtYear(c); return y ? { v: y, t: `${yr - y}년차`, s: y + '년' } : null; }, +1],
      ['세대수', c => c.reg && c.reg.hh ? { v: c.reg.hh, t: c.reg.hh.toLocaleString() + '세대', s: c.reg.bld ? c.reg.bld + '개 동' : '' } : null, +1],
      ['세대당 주차', c => c.reg && c.reg.hh && c.reg.park ? { v: c.reg.park / c.reg.hh, t: (c.reg.park / c.reg.hh).toFixed(2) + '대', s: c.reg.park.toLocaleString() + '대' } : null, +1],
      ['가까운 역', c => c.st ? { v: RE.walkMin(c.st.d, CFG.walkSpeed), t: `도보 ${RE.walkMin(c.st.d, CFG.walkSpeed)}분`, s: c.st.s.name } : null, -1],
      ['12개월 매매', c => ({ v: c.T.length, t: c.T.length + '건' }), +1, '많을수록 사고팔기 쉬움'],
      ['우리 매물', c => { const L = RE.listings && RE.listings.groups ? RE.listings.groups().get(c) : null;
        return L && L.length ? { v: null, t: L.length + '건', s: L.slice(0, 2).map(x => `${x.kind} ${RE.listings.priceText(x)} · ${x.area}㎡(${(x.area / PY).toFixed(0)}평)`).join(' / ') } : null; }, 0],
    ];
  }

  function drawSheet() {
    const P = picked();
    sheet.textContent = '';
    const head = el('header');
    head.append(el('h2', null, '⚖ 단지 나란히 비교'), el('p', null, `면적 기준: ${RE.BANDS[RE.state.band][0]} · ★ 표시는 그 항목에서 유리한 단지`));
    const x = el('button', 're-x', '×'); x.type = 'button'; x.setAttribute('aria-label', '비교 닫기'); x.onclick = close;
    sheet.append(x, head);

    const tb = el('table', 're-cmp-tbl'), tr0 = el('tr');
    tr0.append(el('th'));
    P.forEach((c, i) => { const th = el('th', 'c' + i); th.scope = 'col'; th.append(el('b', null, `${NUM[i]} ${c.name}`), el('small', null, `${c.sgg} ${c.dong}`)); tr0.append(th); });
    const thead = el('thead'); thead.append(tr0); tb.append(thead);
    const tbody = el('tbody');
    for (const [name, f, dir, hint] of rows()) {
      const vals = P.map(c => { try { return f(c); } catch (e) { console.warn('[비교]', name, e); return null; } });
      if (vals.every(v => !v)) continue;
      const nums = vals.map(v => v && v.v != null ? v.v : null).filter(v => v != null);
      const best = dir && nums.length >= 2 && new Set(nums).size > 1 ? (dir > 0 ? Math.max(...nums) : Math.min(...nums)) : null;
      const tr = el('tr'), th = el('th', null, name); th.scope = 'row'; if (hint) th.append(el('small', null, hint)); tr.append(th);
      vals.forEach((v, i) => {
        const td = el('td', 'c' + i);
        if (!v) td.append(el('span', 're-cmp-na', '-'));
        else {
          const b = el('b', v.cls || null, v.t); if (best != null && v.v === best) { td.classList.add('best'); b.textContent = '★ ' + v.t; }
          td.append(b); if (v.s) td.append(el('small', null, v.s));
        }
        tr.append(td);
      });
      tbody.append(tr);
    }
    tb.append(tbody); sheet.append(tb);
    sheet.append(el('p', 're-foot', '자료: 국토교통부 실거래가(최근 12개월, 신고 기준)·건축물대장. ★는 숫자만 본 것이며, 집을 고를 때는 손님 사정에 맞춰 함께 판단하세요. 참고용입니다.'));
  }

  /* 담은 단지(건물·번호표)가 모두 표 위쪽 빈 화면에 들어오는, 가장 가까운 카메라 자리를 찾는다.
     flyTo 와 같은 식으로 카메라 사본을 놓아 보며 거리(dist)와 중심 밀기(s)를 바꿔 시험한다. */
  function frame(P) {
    const T = RE.T, THREE = window.THREE; if (!T || !THREE || !RE.flyTo) return;
    const cx = P.reduce((a, c) => a + c.x, 0) / P.length, cz = P.reduce((a, c) => a + c.z, 0) / P.length;
    const az = Math.atan2(T.camera.position.x - T.controls.target.x, T.camera.position.z - T.controls.target.z), EL = .85;
    const top = innerHeight - 16 - sheet.offsetHeight; // 표 윗변(화면 px)
    const yLow = 1 - 2 * top / innerHeight + .1, yHigh = .86, xLim = .82;
    const cam = T.camera.clone(), v = new THREE.Vector3();
    const pts = P.flatMap(c => [[c.x, 0, c.z], [c.x, (c.top || 40) + 110, c.z]]);
    const fits = (tx, tz, d) => {
      cam.position.set(tx + Math.sin(az) * Math.cos(EL) * d, Math.sin(EL) * d, tz + Math.cos(az) * Math.cos(EL) * d);
      cam.lookAt(tx, 0, tz); cam.updateMatrixWorld();
      return pts.every(([x, y, z]) => { v.set(x, y, z).project(cam); return v.z < 1 && Math.abs(v.x) <= xLim && v.y >= yLow && v.y <= yHigh; });
    };
    const dMax = T.controls.maxDistance && isFinite(T.controls.maxDistance) ? T.controls.maxDistance : 12000; // 지도가 허락하는 가장 먼 거리까지
    let best = null;
    for (let d = 350; d <= dMax && !best; d *= 1.1)
      for (let s = 0; s <= .6 && !best; s += .05) { const tx = cx + Math.sin(az) * d * s, tz = cz + Math.cos(az) * d * s; if (fits(tx, tz, d)) best = [tx, tz, d]; }
    if (!best) { console.warn('[비교] 화면에 다 들어오는 자리를 못 찾아 넓게 봅니다'); best = [cx, cz, dMax]; }
    RE.flyTo(best[0], best[1], best[2], az, EL, 1600);
  }

  function open() {
    const P = picked(); if (P.length < 2) return;
    RE.closeCard && RE.closeCard();
    drawSheet(); sheet.classList.add('on'); body.classList.add('cmp-open');
    frame(P);
    const x = sheet.querySelector('.re-x'); x && x.focus({ preventScroll: true });
  }
  function close() { sheet.classList.remove('on'); body.classList.remove('cmp-open'); }

  addEventListener('keydown', e => { if (e.key === 'Escape' && sheet.classList.contains('on')) close(); });
  new MutationObserver(() => { if (body.classList.contains('idle') && sheet.classList.contains('on')) close(); })
    .observe(body, { attributes: true, attributeFilter: ['class'] });

  /* ---------- 지도 위 번호 표 (①②③, 표의 열 색과 같음) ---------- */
  const layer = el('div', 're-cmp-layer'); body.append(layer);
  let marks = [];
  function syncMarks() {
    const P = picked();
    if (marks.length === P.length && marks.every((m, i) => m.c === P[i])) return;
    layer.textContent = '';
    marks = P.map((c, i) => { const b = el('span', 're-cmp-mark c' + i, `${NUM[i]} ${c.name}`); layer.append(b); return { c, b }; });
  }
  function placeMarks() {
    syncMarks();
    const T = RE.T, THREE = window.THREE;
    if (T && THREE && marks.length) {
      const v = placeMarks.v || (placeMarks.v = new THREE.Vector3()), W = innerWidth, H = innerHeight;
      for (const m of marks) {
        v.set(m.c.x, (m.c.top || 40) + 70, m.c.z).project(T.camera);
        const ok = v.z < 1 && Math.abs(v.x) < 1.02 && Math.abs(v.y) < 1.02;
        m.b.style.display = ok ? '' : 'none';
        if (ok) m.b.style.transform = `translate(${(v.x + 1) / 2 * W}px,${(1 - v.y) / 2 * H}px) translate(-50%,-100%)`;
      }
    }
    requestAnimationFrame(placeMarks);
  }
  requestAnimationFrame(placeMarks);

  RE.compare = { open, close, picks: () => picked() };
})();
