/* ===== 내 매물: 엑셀(.xlsx/.csv)로 올린 사무소 매물을 지도에 핀으로 표시 =====
   - 매물은 이 브라우저(localStorage)에만 저장한다. 서버·GitHub 로 보내지 않는다.
     (공인중개사법상 인터넷 표시·광고 규정이 있으므로, 공개 페이지에 매물을 올리는 기능은 일부러 두지 않는다)
   - 단지명으로 지도 위 단지를 찾아 연결한다. 못 찾은 줄은 몇 번째 줄인지 알려 준다.
   - 핀을 누르면 단지 정보 카드가 열리고, 카드 맨 위에 '우리 사무소 매물'과 실거래 비교가 붙는다.
   - 엑셀 읽기는 SheetJS(공식 CDN, 무결성 확인값 고정)를 파일을 고를 때만 불러온다. */
(() => {
  const RE = window.RE = window.RE || {};
  const CFG = window.RE_CONFIG || {};
  const el = RE.el, won = v => RE.won(v);
  const STORE = 'town3d.listings';
  const XLSX_SRC = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
  const XLSX_SRI = 'sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT';
  const COLS = ['단지명', '거래유형', '가격(만원)', '월세(만원)', '전용면적(㎡)', '동', '층', '방향', '메모'];
  const KINDS = ['매매', '전세', '월세'];

  /* ---------- 저장 ---------- */
  function load() {
    try { const j = JSON.parse(localStorage.getItem(STORE) || 'null'); return j && Array.isArray(j.rows) ? j : null; }
    catch (e) { console.warn('[매물] 저장본을 읽지 못했습니다:', e.message); return null; }
  }
  function save(data) {
    try { if (data) localStorage.setItem(STORE, JSON.stringify(data)); else localStorage.removeItem(STORE); return true; }
    catch (e) { console.warn('[매물] 저장하지 못했습니다:', e.message); return false; }
  }

  /* ---------- 엑셀 읽기 ---------- */
  let xlsxP = null;
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (xlsxP) return xlsxP;
    xlsxP = new Promise((ok, no) => {
      const s = document.createElement('script');
      s.src = XLSX_SRC; s.integrity = XLSX_SRI; s.crossOrigin = 'anonymous';
      s.onload = () => (window.XLSX ? ok(window.XLSX) : no(new Error('엑셀 읽기 도구가 비어 있습니다')));
      s.onerror = () => { xlsxP = null; no(new Error('엑셀 읽기 도구(SheetJS)를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요')); };
      document.head.append(s);
    });
    return xlsxP;
  }
  const keyOf = h => String(h || '').replace(/\s|\(.*?\)|㎡/g, '');
  const num = v => { const n = parseFloat(String(v ?? '').replace(/[,\s원만]/g, '')); return isFinite(n) ? n : 0; };
  const txt = (v, max = 60) => String(v ?? '').trim().slice(0, max);

  /* 한 줄 → 매물. 문제가 있으면 { err } */
  function parseRow(o, line) {
    const g = k => o[k];
    const name = txt(g('단지명'), 40), kind = txt(g('거래유형'), 4), price = num(g('가격')), rent = num(g('월세')), area = num(g('전용면적'));
    if (!name && !price && !area) return null; // 빈 줄
    const err = !name ? '단지명이 비어 있습니다' : !KINDS.includes(kind) ? `거래유형은 매매·전세·월세 중 하나여야 합니다('${kind}')`
      : !(price > 0) ? '가격(만원)이 비어 있거나 숫자가 아닙니다' : !(area > 5 && area < 400) ? '전용면적(㎡)이 비어 있거나 범위를 벗어났습니다'
      : kind === '월세' && !(rent > 0) ? '월세 매물은 월세(만원)를 적어 주세요' : '';
    if (err) return { line, name, err };
    return { line, name, kind, price, rent: kind === '월세' ? rent : 0, area, dong: txt(g('동'), 10), floor: txt(g('층'), 10), dir: txt(g('방향'), 10), memo: txt(g('메모'), 80) };
  }
  async function readFile(file) {
    const X = await loadXLSX();
    const wb = X.read(await file.arrayBuffer(), { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new Error('첫 번째 시트가 비어 있습니다');
    const raw = X.utils.sheet_to_json(ws, { defval: '', raw: true });
    const rows = [], bad = [];
    raw.forEach((r, i) => {
      const o = {}; for (const [k, v] of Object.entries(r)) o[keyOf(k)] = v;
      const p = parseRow(o, i + 2); // 1번 줄은 제목 줄
      if (!p) return; if (p.err) bad.push(p); else rows.push(p);
    });
    return { rows, bad };
  }

  /* ---------- 단지 찾기 ---------- */
  const norm = s => String(s || '').toLowerCase().replace(/\(.*?\)|아파트|apt|\s|-|·|,|\./g, '').replace(/제?(\d+)차/g, '$1차');
  function findComplex(name) {
    const C = RE.C || [], n = norm(name);
    if (!n) return null;
    const exact = C.filter(c => norm(c.name) === n || norm(c.reg && c.reg.bname) === n);
    if (exact.length) return exact[0];
    const part = C.filter(c => { const a = norm(c.name); return a && (a.includes(n) || n.includes(a)); });
    return part.length === 1 ? part[0] : null; // 여러 단지에 걸리면 잘못 붙일 수 있어 연결하지 않음
  }

  /* ---------- 실거래 비교 ---------- */
  const near = (a, b) => Math.abs(a - b) <= Math.max(3, b * 0.04);
  function compare(L, c) {
    const med = RE.median;
    if (L.kind === '매매') {
      const ps = c.T.filter(t => near(t[1], L.area)).map(t => t[3]);
      if (ps.length) { const m = med(ps); return { n: ps.length, m, diff: Math.round((L.price / m - 1) * 1000) / 10, what: '같은 면적 매매' }; }
    } else if (L.kind === '전세') {
      const ps = c.R.filter(r => r[4] === 0 && near(r[1], L.area)).map(r => r[3]);
      if (ps.length) { const m = med(ps); return { n: ps.length, m, diff: Math.round((L.price / m - 1) * 1000) / 10, what: '같은 면적 전세' }; }
    } else {
      const rs = c.R.filter(r => r[4] > 0 && near(r[1], L.area));
      if (rs.length) return { n: rs.length, m: med(rs.map(r => r[4])), dep: med(rs.map(r => r[3])), what: '같은 면적 월세' };
    }
    return null;
  }
  const priceText = L => L.kind === '월세' ? `${won(L.price)} / 월 ${L.rent.toLocaleString()}만` : won(L.price);

  /* ---------- 지도 핀 ---------- */
  let pins = [], layer = null;
  function groups() {
    const data = load(), m = new Map(), miss = [];
    for (const L of data ? data.rows : []) { const c = findComplex(L.name); if (!c) { miss.push(L); continue; } if (!m.has(c)) m.set(c, []); m.get(c).push(L); }
    return { m, miss };
  }
  function buildPins() {
    if (!layer) { layer = el('div', 're-lst-layer'); document.body.append(layer); }
    layer.textContent = ''; pins = [];
    for (const [c, Ls] of groups().m) {
      const b = el('button', 're-lst-pin'); b.type = 'button';
      b.append(el('span', 're-lst-ico', '🏠'), el('span', null, `매물 ${Ls.length}`));
      b.title = `${c.name} · 우리 사무소 매물 ${Ls.length}건`;
      b.onclick = () => RE.openCard && RE.openCard(c);
      layer.append(b); pins.push({ c, b, on: null });
    }
  }
  function placePins() {
    const T = RE.T, THREE = window.THREE;
    if (RE.C !== placePins.C) { placePins.C = RE.C; buildPins(); } // 주소로 다른 동네를 만들면 단지 목록이 바뀐다
    if (T && THREE && pins.length) {
      const hide = document.body.classList.contains('driving') || document.getElementById('bSub')?.getAttribute('aria-pressed') === 'true';
      const v = placePins.v || (placePins.v = new THREE.Vector3()), W = innerWidth, H = innerHeight;
      for (const p of pins) {
        v.set(p.c.x, (p.c.top || 40) + 40, p.c.z).project(T.camera);
        const ok = !hide && v.z < 1 && Math.abs(v.x) < 1.02 && Math.abs(v.y) < 1.02;
        if (ok !== p.on) { p.b.style.display = ok ? '' : 'none'; p.on = ok; }
        if (ok) p.b.style.transform = `translate(${(v.x + 1) / 2 * W}px,${(1 - v.y) / 2 * H}px) translate(-50%,-100%)`;
      }
    }
    requestAnimationFrame(placePins);
  }

  /* ---------- 단지 카드에 '우리 사무소 매물' 붙이기 ---------- */
  function cardSection(c) {
    const Ls = groups().m.get(c);
    const card = document.getElementById('reCard');
    if (!card || !Ls || !Ls.length) return;
    card.querySelector('.re-lst-sec')?.remove();
    const sec = el('section', 're-lst-sec');
    sec.append(el('h3', null, `🏠 ${(CFG.office && CFG.office.label) || '우리 사무소'} 매물 ${Ls.length}건`));
    for (const L of Ls) {
      const it = el('div', 're-lst-item'), cmp = compare(L, c);
      it.append(el('b', null, `${L.kind} ${priceText(L)}`),
        el('span', null, [`전용 ${L.area}㎡(${(L.area / 3.305785).toFixed(0)}평)`, L.dong && L.dong + '동', L.floor && L.floor + '층', L.dir].filter(Boolean).join(' · ')));
      if (L.memo) it.append(el('em', null, L.memo));
      if (cmp && cmp.diff != null) {
        const d = cmp.diff, cls = d <= -1 ? 'down' : d >= 1 ? 'up' : 'eq';
        it.append(el('small', 're-lst-cmp ' + cls, `최근 12개월 ${cmp.what} ${cmp.n}건 중앙값 ${won(cmp.m)} 대비 ${d > 0 ? '+' : ''}${d}%`));
      } else if (cmp) it.append(el('small', 're-lst-cmp eq', `최근 12개월 ${cmp.what} ${cmp.n}건 · 보증금 ${won(cmp.dep)} / 월 ${Math.round(cmp.m)}만 (중앙값)`));
      else it.append(el('small', 're-lst-cmp eq', '최근 12개월 같은 면적 실거래가 없어 비교하지 않았습니다'));
      sec.append(it);
    }
    sec.append(el('p', 're-lst-note', '실거래는 신고 기준(최대 30일 늦음)이며 참고용입니다.'));
    const head = card.querySelector('header');
    if (head) head.after(sec); else card.prepend(sec);
  }
  function hookCard() {
    if (typeof RE.openCard !== 'function') return false;
    const open = RE.openCard, refresh = RE.refreshCard;
    RE.openCard = (c, ...a) => { const r = open(c, ...a); cardSection(c); return r; };
    if (typeof refresh === 'function') RE.refreshCard = (...a) => { const r = refresh(...a); const c = RE.state && RE.state.picked; if (c) cardSection(c); return r; };
    return true;
  }

  /* ---------- 📋 내 매물 창 ---------- */
  let dlg, msg, list;
  function sampleRows() {
    const top = [...(RE.C || [])].filter(c => c.T.length).sort((a, b) => b.T.length - a.T.length).slice(0, 3);
    /* 예시는 이 지도에 실제로 있는 단지 3곳의 최근 거래 면적·가격을 써서, 올리면 바로 핀이 뜨게 한다 */
    const last = c => c.T.at(-1) || [0, 84.9, 0, 90000];
    const ex = [c => ['매매', last(c)[3], '', '남향', '올수리, 즉시 입주'], () => ['전세', 50000, '', '동남향', '2027년 3월 입주 가능'], () => ['월세', 5000, 150, '남서향', '역 도보 5분']];
    return [COLS, ...top.map((c, i) => { const e = ex[i](c); return [c.name, e[0], e[1], e[2], last(c)[1], '101', '12', e[3], e[4]]; })];
  }
  async function downloadSample() {
    try {
      const X = await loadXLSX(), ws = X.utils.aoa_to_sheet(sampleRows()), wb = X.utils.book_new();
      ws['!cols'] = COLS.map(h => ({ wch: Math.max(10, h.length * 2) }));
      X.utils.book_append_sheet(wb, ws, '매물'); X.writeFile(wb, '매물-예시.xlsx');
    } catch (e) { msg.textContent = '예시 파일을 만들지 못했습니다: ' + e.message; }
  }
  function renderList() {
    const data = load(); list.textContent = '';
    if (!data) { list.append(el('p', 're-lst-note', '아직 올린 매물이 없습니다.')); return; }
    const { m, miss } = groups(); let n = 0; for (const v of m.values()) n += v.length;
    list.append(el('p', null, `${data.file || '매물 파일'} · ${new Date(data.at).toLocaleString('ko-KR')} 올림 · 지도에 ${n}건 표시`));
    if (miss.length) {
      const ul = el('ul', 're-lst-bad');
      for (const L of miss) ul.append(el('li', null, `${L.line}번째 줄 '${L.name}': 이 지도에서 단지를 찾지 못했습니다. 지도 이름표와 같게 적거나, 다른 동네 매물인지 확인해 주세요.`));
      list.append(ul);
    }
  }
  function buildDialog() {
    dlg = el('dialog', 're-keys re-lst-dlg'); dlg.setAttribute('aria-label', '내 매물');
    const form = el('form'); form.method = 'dialog';
    const file = el('input'); file.type = 'file'; file.accept = '.xlsx,.xls,.csv'; file.id = 'reLstFile';
    const pick = el('label', 're-lst-pick', '📂 엑셀 파일 고르기'); pick.htmlFor = 'reLstFile';
    const bSample = el('button', null, '예시 파일 받기'); bSample.type = 'button'; bSample.onclick = downloadSample;
    const bClear = el('button', null, '매물 모두 지우기'); bClear.type = 'button';
    const bClose = el('button', null, '닫기'); bClose.value = 'close';
    msg = el('p', 're-lst-msg'); msg.setAttribute('role', 'status'); list = el('div', 're-lst-list');
    form.append(el('h2', null, '📋 내 매물'),
      el('p', 're-keys-note', `엑셀 첫 줄에 칸 이름(${COLS.join(' · ')})을 적고, 둘째 줄부터 매물을 한 줄씩 적어 주세요. 호수는 적지 마세요. 매물은 이 브라우저에만 저장되고 인터넷으로 보내지 않습니다. 공용 PC에서는 다 쓴 뒤 [매물 모두 지우기]를 눌러 주세요.`),
      el('div', 're-lst-row'), msg, list, el('div', 're-keys-act'));
    form.querySelector('.re-lst-row').append(pick, file, bSample);
    form.querySelector('.re-keys-act').append(bClear, bClose);
    dlg.append(form); document.body.append(dlg);

    file.onchange = async () => {
      const f = file.files && file.files[0]; if (!f) return;
      msg.textContent = '읽는 중…';
      try {
        const { rows, bad } = await readFile(f);
        if (!rows.length) { msg.textContent = '읽을 수 있는 매물이 없습니다. ' + (bad[0] ? `${bad[0].line}번째 줄: ${bad[0].err}` : '첫 줄 칸 이름을 확인해 주세요.'); return; }
        if (!save({ file: f.name.slice(0, 60), at: Date.now(), rows })) { msg.textContent = '이 브라우저에 저장하지 못했습니다(저장 공간 부족 또는 개인정보 보호 모드).'; return; }
        msg.textContent = `${rows.length}건을 읽었습니다.` + (bad.length ? ` 건너뛴 줄 ${bad.length}개: ` + bad.slice(0, 5).map(b => `${b.line}번째 줄(${b.err})`).join(', ') : '');
        buildPins(); renderList();
      } catch (e) { console.warn('[매물] 파일 읽기 실패:', e); msg.textContent = '파일을 읽지 못했습니다: ' + e.message; }
      finally { file.value = ''; }
    };
    bClear.onclick = () => { if (save(null)) { msg.textContent = '매물을 모두 지웠습니다.'; buildPins(); renderList(); } };
  }
  function openDialog() { if (!dlg) buildDialog(); msg.textContent = ''; renderList(); dlg.showModal(); }

  /* 부동산 레이어(RE.C)가 준비되면 시작 */
  const t0 = Date.now(), wait = setInterval(() => {
    if (RE.C && RE.T && typeof RE.openCard === 'function') {
      clearInterval(wait);
      const row = document.querySelector('.card .row');
      if (row) { const b = el('button', 're-lst-btn', '📋 내 매물'); b.type = 'button'; b.onclick = openDialog; row.append(b); }
      hookCard(); buildPins(); requestAnimationFrame(placePins);
    } else if (Date.now() - t0 > 180000) { clearInterval(wait); console.warn('[매물] 부동산 레이어가 준비되지 않아 매물 핀을 켜지 못했습니다.'); }
  }, 300);

  RE.listings = { reload: buildPins, open: openDialog };
})();
