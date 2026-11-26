/* ===== 사무실 대기 화면 =====
   - 아무도 만지지 않고 RE_CONFIG.idle.minutes 분이 지나면: 메뉴를 숨기고 지도를 천천히 돌리며
     사무소 이름·전화·한 줄 소개와 '휴대폰 브리핑(brief.html)' QR을 크게 띄운다.
   - 마우스를 움직이거나(10px 넘게), 누르거나, 키를 누르면 원래 화면으로 돌아온다.
   - [🖥 대기 화면] 버튼으로 바로 켤 수도 있다(이때는 브라우저 전체 화면도 함께 시도).
   - QR 은 qrcode-generator(MIT, Kazuhiko Arase)를 공식 CDN에서 무결성 확인값과 함께 필요할 때만 불러온다. */
(() => {
  const RE = window.RE = window.RE || {};
  const CFG = window.RE_CONFIG || {}, IC = CFG.idle || {};
  const el = RE.el, body = document.body;
  const QR_SRC = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
  const QR_SRI = 'sha384-8FWZA6BGMXhsfO+BLtrJK0We6gg5o1JyO8xQm6peWDEUs17ACA5ziE/NIAkl9z2k';
  const MIN = Math.max(0, +IC.minutes || 0);

  /* ---------- QR ---------- */
  let qrP = null;
  function loadQR() {
    if (window.qrcode) return Promise.resolve(window.qrcode);
    if (qrP) return qrP;
    qrP = new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = QR_SRC; s.integrity = QR_SRI; s.crossOrigin = 'anonymous';
      s.onload = () => (window.qrcode ? ok(window.qrcode) : no(new Error('QR 도구가 비어 있습니다')));
      s.onerror = () => { qrP = null; no(new Error('QR 도구를 불러오지 못했습니다(인터넷 연결 확인)')); };
      document.head.append(s);
    });
    return qrP;
  }
  const briefURL = () => new URL('brief.html', location.href).href.replace(/[?#].*$/, '');

  /* ---------- 화면 ---------- */
  const ov = el('div', 're-idle'); ov.setAttribute('aria-hidden', 'true');
  const brand = el('div', 're-idle-brand');
  brand.append(el('b', null, (CFG.office && CFG.office.label) || CFG.brand || ''),
    el('span', 're-idle-tel', CFG.contact && CFG.contact.tel ? '☎ ' + CFG.contact.tel : ''),
    el('em', null, IC.tagline || ''));
  const qrBox = el('div', 're-idle-qr');
  const qrImg = el('img'); qrImg.alt = '휴대폰 브리핑 QR'; qrImg.width = qrImg.height = 168;
  qrBox.append(qrImg, el('span', null, IC.qrLabel || '휴대폰으로 브리핑 받기'));
  const hint = el('p', 're-idle-hint', '화면을 누르거나 마우스를 움직이면 메뉴가 나옵니다');
  ov.append(brand, qrBox, hint);
  body.append(ov);

  async function drawQR() {
    if (qrImg.src) return;
    try {
      const qr = (await loadQR())(0, 'M'); qr.addData(briefURL()); qr.make();
      qrImg.src = qr.createDataURL(6, 2);
    } catch (e) { console.warn('[대기 화면] QR을 만들지 못했습니다:', e.message); qrBox.hidden = true; }
  }

  /* ---------- 켜기·끄기 ---------- */
  let on = false, before = null, timer = 0, armAt = 0, fsByUs = false, eatClick = false;
  const ctl = () => window.town3d && window.town3d.controls;
  const busy = () => body.classList.contains('present') || body.classList.contains('driving') || !!document.querySelector('dialog[open]');

  function start(manual = false) {
    if (on || busy()) return;
    on = true; armAt = Date.now() + 600; // 켜는 순간의 클릭·움직임으로 바로 꺼지지 않게
    const c = ctl();
    before = { kiosk: body.classList.contains('kiosk'), rot: !!(c && c.autoRotate) };
    if (RE.closeCard) RE.closeCard();
    body.classList.add('kiosk', 'idle');
    if (c) { c.autoRotate = true; document.getElementById('bRot')?.setAttribute('aria-pressed', 'true'); }
    drawQR();
    if (manual && !document.fullscreenElement && document.documentElement.requestFullscreen)
      document.documentElement.requestFullscreen().then(() => { fsByUs = true; }, e => console.warn('[대기 화면] 전체 화면을 쓰지 못해 메뉴만 숨깁니다:', e.message));
  }
  function stop() {
    if (!on) return;
    on = false; body.classList.remove('idle');
    if (before && !before.kiosk) body.classList.remove('kiosk');
    if (fsByUs && document.fullscreenElement) document.exitFullscreen().catch(e => console.warn('[대기 화면] 전체 화면 끝내기 실패:', e.message));
    fsByUs = false;
    const c = ctl();
    if (c && before) { c.autoRotate = before.rot; document.getElementById('bRot')?.setAttribute('aria-pressed', String(before.rot)); }
    arm();
  }
  function arm() { clearTimeout(timer); if (MIN) timer = setTimeout(() => start(false), MIN * 60000); }

  /* 사용자가 무언가 하면: 대기 중이면 끄고, 아니면 타이머를 다시 잰다 */
  let px = -1, py = -1;
  function activity(e) {
    if (e.type === 'pointermove') {
      if (px >= 0 && Math.hypot(e.clientX - px, e.clientY - py) < 10) return;
      px = e.clientX; py = e.clientY;
    }
    if (on) { if (Date.now() < armAt) return; if (e.type !== 'pointermove') { e.preventDefault(); e.stopPropagation(); eatClick = e.type === 'pointerdown'; } stop(); }
    else arm();
  }
  /* 대기 화면을 끄려고 누른 클릭이 지도(건물 선택)까지 가지 않게 한 번 삼킨다 */
  addEventListener('click', e => { if (eatClick) { eatClick = false; e.preventDefault(); e.stopPropagation(); } }, { capture: true });
  for (const t of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'])
    addEventListener(t, activity, { capture: true, passive: t === 'pointermove' || t === 'wheel' || t === 'touchstart' });

  /* 버튼 */
  const row = document.querySelector('.card .row');
  if (row) { const b = el('button', 're-idle-btn', '🖥 대기 화면'); b.type = 'button'; b.title = '사무실 대기 화면 켜기(지도 회전 + 사무소 이름·전화·QR)'; b.onclick = () => start(true); row.append(b); }
  arm();

  RE.idle = { start, stop };
})();
