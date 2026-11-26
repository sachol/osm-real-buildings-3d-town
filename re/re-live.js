/* 실시간 불러오기: 주소 모드에서 사용자 자신의 공공데이터포털 키로 그 지역 실거래가·건축물대장을 받아 부동산 레이어를 켠다.
   지난달까지의 자료는 바뀌지 않으므로 브라우저 캐시(Cache Storage)에 두고 다시 쓴다. */
(() => {
  const RE = window.RE = window.RE || {};
  const DGK = 'https://apis.data.go.kr/1613000/';
  const MONTHS = 12, CONC = 4, MAX_REG = 200;
  let box;

  /* ---------- 상태 상자 ---------- */
  function status(text, opt = {}) {
    if (!box) { box = RE.el('div', 're-live'); box.setAttribute('aria-live', 'polite'); document.body.append(box); }
    box.textContent = '';
    box.append(RE.el('p', null, text));
    if (opt.pct != null) { const bar = RE.el('i'); const fill = RE.el('b'); fill.style.width = Math.round(opt.pct * 100) + '%'; bar.append(fill); box.append(bar); }
    if (opt.keys) { const b = RE.el('button', null, '⚙ API 설정 열기'); b.onclick = RE.openKeys; box.append(b); }
    if (opt.close) { const b = RE.el('button', null, '닫기'); b.onclick = () => box.remove(); box.append(b); }
    box.hidden = false;
  }
  const done = () => { if (box) box.remove(); box = null; };

  /* ---------- 공통 ---------- */
  const tag = (x, t) => { const m = x.match(new RegExp(`<${t}>([^<]*)</${t}>`)); return m ? m[1].trim() : ''; };
  const num = s => +String(s || '').replace(/,/g, '') || 0;
  async function getText(url, cacheKey) {
    let cache = null;
    if (cacheKey && 'caches' in window) { try { cache = await caches.open('re-molit-v1'); const hit = await cache.match(cacheKey); if (hit) return hit.text(); } catch (e) { console.warn('[RE] 캐시 사용 불가', e.message); cache = null; } }
    let last;
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const t = await r.text();
        if (cache && (/<resultCode>000</.test(t) || /"resultCode"s*:s*"00"/.test(t))) await cache.put(cacheKey, new Response(t)); // 정상 응답(XML·JSON)만 저장
        return t;
      } catch (e) { last = e; await new Promise(r => setTimeout(r, 1200 * (i + 1))); }
    }
    throw last;
  }
  async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } })); }
  function months() { const out = [], d = new Date(); for (let i = 0; i < MONTHS; i++) { const t = new Date(d.getFullYear(), d.getMonth() - i, 1); out.push(`${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, '0')}`); } return out.reverse(); }
  /* 실거래 신고는 계약 후 30일까지 들어오므로, 2달 이상 지난 달만 '바뀌지 않는 자료'로 보고 저장한다 */
  const stableYm = months().at(-3);

  /* ---------- 1) 반경에 걸친 시군구 ---------- */
  async function findSgg(D) {
    const KX = 111320 * Math.cos(D.lat0 * Math.PI / 180), KZ = 110950, R = D.r || 1000, k = R * .8;
    const pts = [[0, 0], [k, 0], [-k, 0], [0, k], [0, -k]], found = new Map();
    for (const [x, z] of pts) {
      const lat = D.lat0 - z / KZ, lon = D.lon0 + x / KX;
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=ko&lat=${lat}&lon=${lon}`, { signal: AbortSignal.timeout(15000) });
        if (!r.ok) throw new Error(`주소 검색 서버 응답 ${r.status}`);
        const j = await r.json(), vals = Object.values(j.address || {}).map(String);
        let best = null;
        for (const [code, name] of window.RE_SGG || []) {
          const w = name.split(' '), hit = w.filter(x => vals.includes(x)).length;
          if (vals.includes(w.at(-1)) && (!best || hit > best.hit || (hit === best.hit && w.length > best.w))) best = { code, name, hit, w: w.length };
        }
        if (best) found.set(best.code, best.name);
      } catch (e) { console.warn('[RE] 시군구 찾기 실패', e.message); }
      await new Promise(r => setTimeout(r, 1100)); // 주소 검색 서버 이용 정책: 초당 1회
    }
    return [...found].map(([code, name]) => ({ code, name }));
  }

  /* ---------- 2) 실거래가 ---------- */
  async function fetchKind(kind, key, sgg, ym) {
    const svc = kind === 'trade' ? 'RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev' : 'RTMSDataSvcAptRent/getRTMSDataSvcAptRent';
    const items = [];
    for (let page = 1; page <= 10; page++) {
      const url = `${DGK}${svc}?serviceKey=${encodeURIComponent(key)}&LAWD_CD=${sgg}&DEAL_YMD=${ym}&numOfRows=1000&pageNo=${page}`;
      const ck = ym <= stableYm ? `https://re-cache.local/${kind}/${sgg}/${ym}/${page}` : null;
      const xml = await getText(url, ck), code = tag(xml, 'resultCode');
      if (code !== '000') throw new Error(/NOT_REGISTERED/.test(xml) ? '활용신청이 안 된 API' : tag(xml, 'resultMsg') || tag(xml, 'returnAuthMsg') || '응답 오류');
      const chunk = xml.split('<item>').slice(1).map(s => s.split('</item>')[0]);
      items.push(...chunk);
      if (items.length >= num(tag(xml, 'totalCount')) || !chunk.length) break;
    }
    return items;
  }
  const ymd = x => +(tag(x, 'dealYear') + tag(x, 'dealMonth').padStart(2, '0') + tag(x, 'dealDay').padStart(2, '0'));

  function group(trades, rents) {
    const map = new Map(), umd = new Map();
    const get = (sgg, dong, jibun, name, by) => {
      const k = `${sgg}|${dong}|${jibun}`; let c = map.get(k);
      if (!c) map.set(k, c = { id: k, sgg, dong, jibun, names: {}, by, T: [], R: [], road: '' });
      c.names[name] = (c.names[name] || 0) + 1; if (by && (!c.by || by < c.by)) c.by = by; return c;
    };
    for (const x of trades) {
      if (tag(x, 'cdealType')) continue;
      const c = get(tag(x, 'sggCd'), tag(x, 'umdNm'), tag(x, 'jibun'), tag(x, 'aptNm'), num(tag(x, 'buildYear')));
      if (!(num(tag(x, 'excluUseAr')) > 0)) continue; // 면적 없는 거래는 평당가를 못 구함
      c.T.push([ymd(x), num(tag(x, 'excluUseAr')), num(tag(x, 'floor')), num(tag(x, 'dealAmount'))]);
      c.umd = tag(x, 'umdCd'); c.bon = tag(x, 'bonbun'); c.bu = tag(x, 'bubun'); c.land = tag(x, 'landCd');
      if (!c.road && tag(x, 'roadNm')) c.road = `${tag(x, 'roadNm')} ${num(tag(x, 'roadNmBonbun'))}`;
      umd.set(c.sgg + '|' + c.dong, c.umd);
    }
    for (const x of rents) {
      const c = get(tag(x, 'sggCd'), tag(x, 'umdNm'), tag(x, 'jibun'), tag(x, 'aptNm'), num(tag(x, 'buildYear')));
      c.R.push([ymd(x), num(tag(x, 'excluUseAr')), num(tag(x, 'floor')), num(tag(x, 'deposit')), num(tag(x, 'monthlyRent'))]);
      if (!c.road && tag(x, 'roadnm')) c.road = tag(x, 'roadnm');
    }
    for (const c of map.values()) {
      c.name = Object.entries(c.names).sort((a, b) => b[1] - a[1])[0][0]; delete c.names;
      if (!c.umd) c.umd = umd.get(c.sgg + '|' + c.dong) || '';
      c.T.sort((a, b) => a[0] - b[0]); c.R.sort((a, b) => a[0] - b[0]);
    }
    return [...map.values()];
  }

  /* ---------- 3) 위치: 지도 속 단지 이름과 맞추기 ---------- */
  const norm = s => String(s || '').toLowerCase().replace(/\(.*?\)|아파트|apt|\s|-|·|,|\./g, '').replace(/제?(\d+)차/g, '$1차');
  const cen = f => { let x = 0, z = 0; for (let i = 0; i < f.length; i += 2) { x += f[i]; z += f[i + 1]; } return [x / (f.length / 2), z / (f.length / 2)]; };
  /* 타일 자료(Overpass 가 바쁠 때 대신 쓰는 자료)에는 건물 이름이 없다. 이름 붙은 아파트·주거단지만 Overpass 에 가볍게 따로 물어 본다 */
  async function nameIndex(D) {
    const named = (D.A || []).some(a => a[1] && a[0] === 'residential') || (D.B || []).some(b => b[2] && b[0] === 'a');
    const ovp = window.town3d && window.town3d.overpass;
    if (named || typeof ovp !== 'function' || !D.lat0) return [];
    const R = (D.r || 1000) * 1.05, KX = 111320 * Math.cos(D.lat0 * Math.PI / 180), KZ = 110950;
    const bb = [D.lat0 - R / KZ, D.lon0 - R / KX, D.lat0 + R / KZ, D.lon0 + R / KX].map(v => v.toFixed(6)).join(',');
    const q = `[out:json][timeout:60];(nwr["building"~"^(apartments|residential)$"]["name"](${bb});nwr["landuse"="residential"]["name"](${bb}););out center tags;`;
    try {
      const j = await ovp(q, { quiet: true });
      return (j.elements || []).map(e => {
        const c = e.center || (e.lat != null ? e : null), t = e.tags || {};
        if (!c || !t.name) return null;
        return { n: norm(t.name), pt: [(c.lon - D.lon0) * KX, (D.lat0 - c.lat) * KZ], w: t.landuse ? 2 : 1 };
      }).filter(Boolean);
    } catch (e) { console.warn('[RE] 아파트 이름 목록을 받지 못했습니다', e.message); return []; }
  }

  function locate(D, C, extra = []) {
    const idx = [...extra];
    for (const [k, n, f] of D.A || []) if (n && k === 'residential') idx.push({ n: norm(n), pt: cen(f), w: 2 });
    for (const b of D.B || []) if (b[2] && b[0] === 'a') idx.push({ n: norm(b[2]), pt: cen(b[3]), w: 1 });
    const R = D.r || 1000, out = [];
    /* 같은 이름이 다른 동에도 있으면(신동아·현대 등) 이름만으로는 어느 곳인지 알 수 없어 표시하지 않는다 */
    const dongs = new Map();
    for (const c of C) { const k = norm(c.name); if (!dongs.has(k)) dongs.set(k, new Set()); dongs.get(k).add(c.sgg + c.dong); }
    for (const c of C) {
      const q = norm(c.name); if (q.length < 3 || dongs.get(q).size > 1) continue;
      let best = null;
      for (const e of idx) if (e.n === q && (!best || e.w > best.w)) best = { w: e.w, pt: e.pt, n: e.n }; // 이름이 정확히 같을 때만
      if (!best || Math.hypot(best.pt[0], best.pt[1]) > R * 1.05) continue;
      if (idx.some(e => e.n === best.n && Math.hypot(e.pt[0] - best.pt[0], e.pt[1] - best.pt[1]) > 500)) continue; // 지도에 같은 이름이 여러 곳
      c.x = Math.round(best.pt[0] * 10) / 10; c.z = Math.round(best.pt[1] * 10) / 10; c.how = 'osm'; out.push(c);
    }
    return out;
  }

  /* ---------- 4) 건축물대장 ---------- */
  async function registry(key, c) {
    if (!c.umd || !c.bon) return null;
    const url = `${DGK}BldRgstHubService/getBrRecapTitleInfo?serviceKey=${encodeURIComponent(key)}&sigunguCd=${c.sgg}&bjdongCd=${c.umd}&platGbCd=${c.land === '2' ? 1 : 0}&bun=${c.bon}&ji=${c.bu || '0000'}&numOfRows=10&pageNo=1&_type=json`;
    try {
      const j = JSON.parse(await getText(url, `https://re-cache.local/reg/${c.sgg}/${c.umd}/${c.bon}/${c.bu}`));
      let it = j?.response?.body?.items?.item; if (!it) return null;
      if (Array.isArray(it)) it = [...it].sort((a, b) => (b.hhldCnt || 0) - (a.hhldCnt || 0))[0];
    if (!it) return null; // 빈 목록(대장 없음)
      return { hh: it.hhldCnt || 0, bld: it.mainBldCnt || 0, park: it.totPkngCnt || 0, far: it.vlRat || 0, bcr: it.bcRat || 0, use: String(it.useAprDay || '').trim(), addr: String(it.newPlatPlc || '').trim() };
    } catch (e) { console.warn('[RE] 건축물대장 실패', c.name, e.message); return null; }
  }

  /* ---------- 전체 흐름 ---------- */
  async function begin() {
    const D = RE.D, key = RE.key && RE.cleanKey(RE.key('datagokr'));
    if (!key) { status('이 지역의 실거래가를 3D로 보려면 공공데이터포털 인증키가 필요합니다. 각자 무료로 발급받아 이 브라우저에 저장해 쓰는 방식입니다.', { keys: true, close: true }); return; }
    try {
      status('이 지역에 걸친 시·군·구를 찾는 중…', { pct: .02 });
      const sggs = await findSgg(D);
      if (!sggs.length) throw new Error('이 위치의 시·군·구를 찾지 못했습니다');
      const ms = months(), jobs = []; for (const s of sggs) for (const m of ms) jobs.push([s, m]);
      const trades = [], rents = [], fails = [];
      let n = 0;
      await pool(jobs, CONC, async ([s, m]) => {
        try { trades.push(...await fetchKind('trade', key, s.code, m)); rents.push(...await fetchKind('rent', key, s.code, m)); }
        catch (e) { fails.push(`${s.name} ${m}: ${e.message}`); }
        n++; status(`실거래가 받는 중 · ${sggs.map(s => s.name.split(' ').at(-1)).join('·')} (${n}/${jobs.length}) · 매매 ${trades.length.toLocaleString()}건`, { pct: .05 + .65 * n / jobs.length });
      });
      if (!trades.length && fails.length) throw new Error(fails[0].split(': ').at(-1));
      status('단지 위치를 지도와 맞추는 중…', { pct: .72 });
      const extra = await nameIndex(D);
      const C = locate(D, group(trades, rents), extra);
      if (!C.length) throw new Error('지도에서 위치를 확인한 아파트 단지가 없습니다 (OSM 단지 이름이 없는 지역일 수 있습니다)');
      const top = [...C].sort((a, b) => b.T.length - a.T.length).slice(0, MAX_REG);
      let k = 0;
      await pool(top, CONC, async c => { c.reg = await registry(key, c); k++; if (k % 10 === 0) status(`건축물대장 받는 중 (${k}/${top.length})`, { pct: .75 + .23 * k / top.length }); });
      const sggName = Object.fromEntries(sggs.map(s => [s.code, s.name.split(' ').at(-1)]));
      C.forEach(c => { c.sgg = sggName[c.sgg] || c.sgg; });
      done();
      RE.boot({
        meta: { at: new Date().toISOString(), months: [ms[0], ms.at(-1)], center: D.place, r: D.r || 1000, lat0: D.lat0, lon0: D.lon0, live: true, fails: fails.length,
          src: '국토교통부 아파트 매매(상세)·전월세 실거래가, 건축HUB 건축물대장 · 공공데이터포털 · 공공누리 제1유형' },
        office: RE.myOfficeFor ? RE.myOfficeFor(D) : null, C,
      });
      if (fails.length) status(`일부 자료(${fails.length}건)를 받지 못했습니다. 잠시 뒤 다시 열면 빠진 부분만 다시 받습니다.`, { close: true });
    } catch (e) {
      console.error('[RE] 실시간 불러오기 실패', e);
      status('실거래가를 불러오지 못했습니다: ' + e.message, { keys: /활용신청|키|인증/.test(e.message), close: true });
    }
  }
  RE.live = { begin };
})();
