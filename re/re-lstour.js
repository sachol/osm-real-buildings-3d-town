/* ===== 🏠 내 매물 자동 소개 =====
   🎬 손님 모드나 🖥 대기 화면일 때 📋 내 매물이 있으면, 지도가 매물 단지를 하나씩 찾아가
   큰 글씨로 '매물 가격 · 면적·층·향 · 최근 실거래 대비'를 보여 준다. 다 돌면 전체를 한 번 보여 주고 처음부터.
   - 손님이 지도를 만지면(클릭·드래그·휠) 30초 쉬었다가 다시 시작한다(대기 화면은 만지면 원래 화면으로 돌아감).
   - 매물이 없으면 아무것도 하지 않는다(기존처럼 회전만). */
(() => {
  const RE = window.RE = window.RE || {};
  const CFG = window.RE_CONFIG || {}, IC = CFG.idle || {};
  const body = document.body, el = RE.el;
  const HOLD = Math.max(4, +IC.listingSec || 9) * 1000, OVERVIEW = 12000, PAUSE = 30000, MAX_LINES = 3;
  const officeName = () => (window.RE_CONFIG && RE_CONFIG.office && RE_CONFIG.office.label) || '우리 사무소';

  /* ---------- 큰 자막 ---------- */
  const cap = el('div', 're-lt-cap'); cap.setAttribute('aria-live', 'polite'); cap.hidden = true;
  body.append(cap);
  function show(c, Ls, i, n) {
    cap.textContent = '';
    cap.append(el('p', 're-lt-head', `🏠 ${officeName()} 매물 · ${i + 1}/${n}`), el('h2', null, c.name));
    const L = RE.listings;
    for (const x of Ls.slice(0, MAX_LINES)) {
      const row = el('div', 're-lt-row');
      row.append(el('b', null, `${x.kind} ${L.priceText(x)}`),
        el('span', null, [`전용 ${x.area}㎡(${(x.area / 3.305785).toFixed(0)}평)`, x.floor && x.floor + '층', x.dir].filter(Boolean).join(' · ')));
      const cmp = L.compare(x, c);
      if (cmp && cmp.diff != null) {
        const d = cmp.diff, cls = d <= -1 ? 'down' : d >= 1 ? 'up' : 'eq';
        row.append(el('i', 're-lt-cmp ' + cls, `실거래 중앙값 대비 ${d > 0 ? '+' : ''}${d}%`));
      }
      if (x.memo) row.append(el('em', null, x.memo));
      cap.append(row);
    }
    if (Ls.length > MAX_LINES) cap.append(el('p', 're-lt-more', `외 ${Ls.length - MAX_LINES}건 더 있습니다`));
    cap.append(el('small', null, '실거래: 같은 단지·같은 면적 최근 12개월 신고분 중앙값(참고용)'));
    cap.hidden = false;
  }

  /* ---------- 순서대로 돌기 ---------- */
  let run = 0, pausedUntil = 0, wakeT = 0;
  const wanted = () => body.classList.contains('idle') || body.classList.contains('guest');
  const ctl = () => window.town3d && window.town3d.controls;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const stops = () => (RE.listings && RE.listings.groups ? [...RE.listings.groups()] : []).filter(([c]) => Number.isFinite(c.x));

  async function loop(id) {
    const alive = () => id === run && wanted() && Date.now() >= pausedUntil;
    let az = .4;
    while (alive()) {
      const S = stops(); if (!S.length) break;
      for (let i = 0; i < S.length && alive(); i++) {
        const [c, Ls] = S[i];
        cap.hidden = true;
        const k = ctl(); if (k) k.autoRotate = false;
        await RE.flyTo(c.x, c.z, 560, az, .62, 2600); az += 1.3;
        if (!alive()) break;
        show(c, Ls, i, S.length);
        if (k) k.autoRotate = true; // 머무는 동안 천천히 돌기
        await wait(HOLD);
      }
      if (!alive()) break;
      cap.hidden = true;
      const k = ctl(); if (k) k.autoRotate = false;
      await RE.flyTo(0, 0, 2600, .4, .95, 3000); // 전체 한 번
      if (k) k.autoRotate = true;
      await wait(OVERVIEW);
    }
    if (id === run) { cap.hidden = true; cap.dataset.on = ''; } // 스스로 끝남(매물 없음·모드 끝) → 다음 check 때 다시 시작 가능
  }
  function check() {
    if (wanted() && Date.now() >= pausedUntil && stops().length) { if (cap.dataset.on !== '1') { cap.dataset.on = '1'; loop(++run); } }
    else if (!wanted() || Date.now() < pausedUntil) { if (cap.dataset.on === '1') { cap.dataset.on = ''; run++; cap.hidden = true; RE.cancelFly && RE.cancelFly(); } }
  }
  /* 손님 모드에서 지도를 만지면 잠시 쉬기 */
  function touched(e) {
    if (!body.classList.contains('guest') || body.classList.contains('idle') || cap.dataset.on !== '1') return;
    if (e.target.closest && e.target.closest('button, a, input, select, dialog')) return;
    pausedUntil = Date.now() + PAUSE; check();
    clearTimeout(wakeT); wakeT = setTimeout(check, PAUSE + 50);
  }
  for (const t of ['pointerdown', 'wheel']) addEventListener(t, touched, { capture: true, passive: true });

  new MutationObserver(() => setTimeout(check, 300)).observe(body, { attributes: true, attributeFilter: ['class'] });
  RE.listingTour = { check };
})();
