/* ===== 화면 보기: 왼쪽 카드 [접기] · [전체 화면] · [손님 모드] · 지도 가장자리 흐리게 =====
   - [접기]: 왼쪽 카드를 제목 두 줄로 줄인다(오른쪽 '부동산 레이어'의 접기와 같은 방식).
   - [전체 화면]: 브라우저 전체 화면 + 메뉴·안내 문구를 숨기고 지도만 보여 준다.
     색 안내(평당가 색 막대)와 자료 기간은 작게 남겨 손님이 색의 뜻을 알 수 있게 한다.
     지도 위 가격표·이름표, 건물을 누르면 나오는 단지 카드는 그대로 둔다.
   - [손님 모드]: 전체 화면 + 자동 회전. 단지 카드가 열리면 회전을 멈추고, 닫으면 다시 돈다.
   - 끝내기: 화면 아래 [메뉴 보기] 버튼, Esc, 또는 F 키(한글 입력 상태에서도 같은 자리 키).
   - 지도 출처(OpenStreetMap·국토교통부)는 전체 화면에서도 작게 남긴다(라이선스 표시 의무). */
(() => {
  const RE = window.RE || {}, el = RE.el || ((t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; });
  const card = document.querySelector('.card');
  if (!card) return;
  const body = document.body;

  /* ---------- 왼쪽 카드 접기 ---------- */
  const fold = el('button', 're-cfold', '접기');
  fold.type = 'button'; fold.setAttribute('aria-expanded', 'true'); fold.title = '왼쪽 메뉴 접기/펴기';
  fold.onclick = () => {
    const folded = card.classList.toggle('folded');
    fold.textContent = folded ? '펴기' : '접기';
    fold.setAttribute('aria-expanded', String(!folded));
  };
  card.prepend(fold);

  /* ---------- 버튼 ---------- */
  const bFull = el('button', 're-full-btn', '⛶ 전체 화면');
  bFull.type = 'button'; bFull.title = '메뉴를 숨기고 지도만 크게 보기 (F 키)';
  const bGuest = el('button', 're-guest-btn', '🎬 손님 모드');
  bGuest.type = 'button'; bGuest.title = '전체 화면 + 자동 회전. 단지를 누르면 회전이 멈춥니다';
  const row = card.querySelector('.row');
  if (row) row.append(bGuest, bFull);

  const exitBar = el('div', 're-kiosk-bar');
  const bExit = el('button', null, '↩ 메뉴 보기'); bExit.type = 'button';
  const src = el('span', 're-kiosk-src');
  exitBar.append(bExit, src);
  body.append(exitBar);

  /* 자료 기간: 왼쪽 카드 설명의 '(2025.12~2026.11 신고분)'을 그대로 가져온다 */
  function srcText() {
    const m = (card.querySelector('p')?.textContent || '').match(/\(([^()]*신고분)\)/);
    return (m ? `실거래 ${m[1]} · ` : '') + '지도 © OpenStreetMap 기여자 · 실거래가·건축물대장: 국토교통부';
  }

  /* ---------- 자동 회전(원본 앱의 [자동 회전] 버튼과 상태를 맞춘다) ---------- */
  const ctl = () => window.town3d && window.town3d.controls;
  function setRotate(on) {
    const c = ctl(); if (!c) return;
    c.autoRotate = on;
    document.getElementById('bRot')?.setAttribute('aria-pressed', String(on));
  }

  /* ---------- 전체 화면 · 손님 모드 ---------- */
  let guest = false, rotBefore = false, resumeT = 0;
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  function enter(asGuest = false) {
    src.textContent = srcText();
    body.classList.add('kiosk');
    if (asGuest && !guest) { guest = true; body.classList.add('guest'); rotBefore = !!(ctl() && ctl().autoRotate); setRotate(true); }
    if (fsEl()) return;
    const root = document.documentElement, req = root.requestFullscreen || root.webkitRequestFullscreen;
    if (!req) return; // 전체 화면을 못 쓰는 브라우저(아이폰 등): 메뉴만 숨긴다
    Promise.resolve(req.call(root)).catch(err => console.warn('[전체 화면] 브라우저가 전체 화면을 허락하지 않아 메뉴만 숨깁니다:', err && err.message));
  }
  function leaveKiosk() {
    body.classList.remove('kiosk');
    clearTimeout(resumeT);
    if (guest) { guest = false; body.classList.remove('guest'); setRotate(rotBefore); }
  }
  function exit() {
    leaveKiosk();
    if (fsEl()) {
      const leave = document.exitFullscreen || document.webkitExitFullscreen;
      Promise.resolve(leave && leave.call(document)).catch(err => console.warn('[전체 화면] 끝내기 실패:', err && err.message));
    }
  }
  const toggle = () => (body.classList.contains('kiosk') ? exit() : enter());
  bFull.onclick = () => enter(false);
  bGuest.onclick = () => enter(true);
  bExit.onclick = exit;

  /* 사용자가 Esc로 브라우저 전체 화면을 끝내면 메뉴도 다시 보이게 */
  const onFs = () => { if (!fsEl() && body.classList.contains('kiosk')) leaveKiosk(); };
  document.addEventListener('fullscreenchange', onFs);
  document.addEventListener('webkitfullscreenchange', onFs);

  addEventListener('keydown', e => {
    if (e.key === 'Escape' && body.classList.contains('kiosk') && !fsEl()) { exit(); return; }
    if (e.code !== 'KeyF' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if (typing || body.classList.contains('present') || body.classList.contains('driving')) return;
    e.preventDefault(); toggle();
  });

  /* 손님 모드: 단지 카드가 열리면 회전 멈춤, 닫히면 1.5초 뒤 다시 회전 */
  function hookCard() {
    if (typeof RE.openCard !== 'function' || typeof RE.closeCard !== 'function') return false;
    const open = RE.openCard, close = RE.closeCard;
    RE.openCard = (...a) => { if (guest) { clearTimeout(resumeT); setRotate(false); } return open(...a); };
    RE.closeCard = (...a) => { const r = close(...a); if (guest) { clearTimeout(resumeT); resumeT = setTimeout(() => guest && setRotate(true), 1500); } return r; };
    return true;
  }

  /* ---------- 지도 가장자리 흐리게 ----------
     반경 바깥이 칼로 자른 듯 끊겨 보이지 않게, 땅 색 판을 반경 92%부터 120%까지 점점 진하게 덮는다.
     땅 높이(1.5 m)에만 깔리므로 반경 안 건물·가격표는 가리지 않는다. */
  function softEdge(T) {
    const R = T.D && T.D.r, THREE = window.THREE;
    if (!R || !THREE) return;
    const N = 1024, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const g = cv.getContext('2d'), half = N / 2, span = 4; // 판 반지름 = 반경 x 4
    const gr = g.createRadialGradient(half, half, half * 0.92 / span, half, half, half * 1.2 / span);
    gr.addColorStop(0, '#000'); gr.addColorStop(1, '#fff');
    g.fillStyle = gr; g.fillRect(0, 0, N, N);
    const mat = new THREE.MeshLambertMaterial({ color: 0xd6d2c4, alphaMap: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false,
      /* 원본은 도로·공원 같은 바닥 면을 polygonOffset으로 앞당겨 그린다. 그보다 더 앞당겨야 덮인다 */
      polygonOffset: true, polygonOffsetFactor: -40, polygonOffsetUnits: -400 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(R * 2 * span, R * 2 * span), mat);
    m.rotation.x = -Math.PI / 2; m.position.y = 1.5; m.renderOrder = 1; m.name = 'softEdge';
    T.scene.add(m);
  }

  /* 원본 앱(3D 장면)과 부동산 레이어가 준비되면 연결 */
  const t0 = Date.now(), wait = setInterval(() => {
    const T = window.town3d;
    if (T && T.scene && RE.openCard) {
      clearInterval(wait);
      hookCard();
      try { softEdge(T); } catch (err) { console.warn('[가장자리] 흐리게 하기 실패:', err && err.message); }
    } else if (Date.now() - t0 > 180000) { clearInterval(wait); console.warn('[화면 보기] 3D 장면이 준비되지 않아 손님 모드 회전 연동·가장자리 효과를 켜지 못했습니다.'); }
  }, 300);

  RE.view = { enter, exit, toggle };
})();
