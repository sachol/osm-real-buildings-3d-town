// 부동산 공공데이터(국토교통부 실거래가·전월세, 건축물대장 총괄표제부)를 받아 re/re-data.js 로 저장한다.
// 지도(data.js)를 먼저 만든 뒤 실행한다:  node tools/bake-realestate.mjs
// 필요: .env 의 DATA_GO_KR_API_KEY (공공데이터포털 인증키, 디코딩 값). 키는 결과 파일에 들어가지 않는다.
// 결과 데이터 출처: 국토교통부 실거래가 공개시스템·건축HUB (공공누리 제1유형, 출처 표시)
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = process.env.RE_OUT || 're/re-data.js';
const MONTHS = +(process.env.RE_MONTHS || 12);
const SGG = { '11590': '동작구', '11560': '영등포구', '11170': '용산구', '11620': '관악구' };
/* lat·lon: 브이월드 주소 검색(도로명)으로 확인한 건물 위치(2026-11-26). Nominatim 은 이 번지를 찾지 못해 도로 가운데로 잡혔었다 */
const OFFICE = { name: '신화공인중개사사무소', addr: '서울 동작구 만양로18길 19-13', road: '만양로18길', lat: 37.51321842400718, lon: 126.94598880589432 };
const UA = 'town3d-realestate-bake/1.0';

/* ---------- 공통 도구 ---------- */
function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) throw new Error('.env 파일이 없습니다. .env.example 을 복사해 키를 넣어 주세요.');
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, ''); // KEY="abc" 처럼 따옴표가 있어도 됨
  }
  if (!env.DATA_GO_KR_API_KEY) throw new Error('.env 에 DATA_GO_KR_API_KEY 가 없습니다.');
  return env;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getText(url, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.text();
    } catch (e) { last = e; await sleep(1500 * (i + 1)); }
  }
  throw new Error(`요청 실패 (${last && last.message})`);
}
const tag = (xml, t) => { const m = xml.match(new RegExp(`<${t}>([^<]*)</${t}>`)); return m ? m[1].trim() : ''; };
const num = s => +String(s || '').replace(/,/g, '') || 0;
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const PY = 3.305785; // 1평 = 3.305785㎡

function monthList(n) {
  const out = [], d = new Date();
  for (let i = 0; i < n; i++) { const t = new Date(d.getFullYear(), d.getMonth() - i, 1); out.push(`${t.getFullYear()}${String(t.getMonth() + 1).padStart(2, '0')}`); }
  return out.reverse();
}

/* ---------- 국토교통부 실거래가 (XML) ---------- */
async function fetchMolit(kind, key, sgg, ym) {
  const svc = kind === 'trade' ? 'RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade' : 'RTMSDataSvcAptRent/getRTMSDataSvcAptRent';
  const items = [];
  for (let page = 1; page <= 20; page++) {
    const url = `https://apis.data.go.kr/1613000/${svc}?serviceKey=${encodeURIComponent(key)}&LAWD_CD=${sgg}&DEAL_YMD=${ym}&numOfRows=1000&pageNo=${page}`;
    const xml = await getText(url);
    const code = tag(xml, 'resultCode');
    /* 키 오류·한도 초과 응답에는 resultCode 가 없으므로, 코드가 없어도 실패로 본다 (0건으로 착각하지 않게) */
    if (code !== '000' && code !== '00') throw new Error(`${kind} ${sgg} ${ym}: ${tag(xml, 'resultMsg') || tag(xml, 'returnAuthMsg') || code || '알 수 없는 응답'}`);
    const chunk = xml.split('<item>').slice(1).map(s => s.split('</item>')[0]);
    items.push(...chunk);
    if (items.length >= num(tag(xml, 'totalCount')) || !chunk.length) break;
  }
  return items;
}

function parseTrade(x) {
  if (tag(x, 'cdealType')) return null; // 해제된 거래 제외
  return {
    name: tag(x, 'aptNm'), dong: tag(x, 'umdNm'), jibun: tag(x, 'jibun'), sgg: tag(x, 'sggCd'), by: num(tag(x, 'buildYear')),
    d: tag(x, 'dealYear') + tag(x, 'dealMonth').padStart(2, '0') + tag(x, 'dealDay').padStart(2, '0'),
    a: num(tag(x, 'excluUseAr')), f: num(tag(x, 'floor')), p: num(tag(x, 'dealAmount')),
  };
}
function parseRent(x) {
  return {
    name: tag(x, 'aptNm'), dong: tag(x, 'umdNm'), jibun: tag(x, 'jibun'), sgg: tag(x, 'sggCd'), by: num(tag(x, 'buildYear')),
    road: tag(x, 'roadnm'),
    d: tag(x, 'dealYear') + tag(x, 'dealMonth').padStart(2, '0') + tag(x, 'dealDay').padStart(2, '0'),
    a: num(tag(x, 'excluUseAr')), f: num(tag(x, 'floor')), dep: num(tag(x, 'deposit')), mon: num(tag(x, 'monthlyRent')),
  };
}

async function collectDeals(key, months) {
  const trades = [], rents = [];
  let fails = 0;
  for (const sgg of Object.keys(SGG)) {
    for (const ym of months) {
      try {
        trades.push(...(await fetchMolit('trade', key, sgg, ym)).map(parseTrade).filter(Boolean));
        rents.push(...(await fetchMolit('rent', key, sgg, ym)).map(parseRent));
      } catch (e) {
        console.warn('  ! 건너뜀:', e.message); fails++;
      }
      console.log(`  ${SGG[sgg]} ${ym} · 누적 매매 ${trades.length.toLocaleString()} · 전월세 ${rents.length.toLocaleString()}`);
    }
  }
  console.log();
  const total = Object.keys(SGG).length * months.length;
  if (fails > total * .2) throw new Error(`실거래가 ${total}묶음 중 ${fails}묶음을 못 받았습니다. 키·이용 한도를 확인해 주세요. (기존 re-data.js 는 그대로 둡니다)`);
  return { trades, rents };
}

/* ---------- 단지별 묶기 ---------- */
const cKey = r => `${r.sgg}|${r.dong}|${r.jibun}`;
function groupComplexes(trades, rents) {
  const map = new Map();
  const get = r => {
    const k = cKey(r);
    let c = map.get(k);
    if (!c) map.set(k, c = { key: k, sgg: r.sgg, dong: r.dong, jibun: r.jibun, names: {}, by: r.by, road: '', T: [], R: [] });
    c.names[r.name] = (c.names[r.name] || 0) + 1;
    if (r.by && (!c.by || r.by < c.by)) c.by = r.by;
    return c;
  };
  for (const t of trades) get(t).T.push([+t.d, t.a, t.f, t.p]);
  for (const r of rents) { const c = get(r); c.R.push([+r.d, r.a, r.f, r.dep, r.mon]); if (r.road && !c.road) c.road = r.road; }
  for (const c of map.values()) c.name = Object.entries(c.names).sort((a, b) => b[1] - a[1])[0][0];
  return [...map.values()];
}

/* ---------- 위치 찾기: OSM 이름 → Nominatim → 수동 보정 ---------- */
const norm = s => String(s || '').toLowerCase().replace(/\(.*?\)|아파트|apt|\s|-|·|,|\./g, '').replace(/제?(\d+)차/g, '$1차');
function centroid(f) { let x = 0, z = 0; for (let i = 0; i < f.length; i += 2) { x += f[i]; z += f[i + 1]; } return [x / (f.length / 2), z / (f.length / 2)]; }
function buildNameIndex(D) {
  const idx = [];
  for (const [k, n, f] of D.A || []) if (n && k === 'residential') idx.push({ n: norm(n), raw: n, pt: centroid(f), w: 2 });
  for (const b of D.B || []) if (b[2] && b[0] === 'a') idx.push({ n: norm(b[2]), raw: b[2], pt: centroid(b[3]), w: 1 });
  return idx.filter(e => e.n.length >= 3);
}
/* 이름으로 지도 속 단지를 찾는다. 같은 이름이 지도에 여러 곳(500 m 이상 떨어짐) 있으면 어느 것인지 모르므로 포기한다. */
function matchOSM(idx, name) {
  const q = norm(name);
  if (q.length < 3) return null;
  let best = null;
  for (const e of idx) {
    /* 정확히 같은 이름만 인정 (부분 일치는 '롯데캐슬'↔'상도역롯데캐슬'처럼 다른 단지를 잡는다) */
    if (e.n === q && (!best || e.w > best.w)) best = { w: e.w, pt: e.pt, raw: e.raw };
  }
  if (!best) return null;
  const same = idx.filter(e => e.n === norm(best.raw));
  if (same.some(e => Math.hypot(e.pt[0] - best.pt[0], e.pt[1] - best.pt[1]) > 500)) return null;
  return best;
}
/* 실거래 자료 안에서 같은 이름이 다른 동에도 있으면(예: 신동아·현대) 이름만으로 위치를 정하면 안 된다 */
function ambiguousNames(all) {
  const dongs = new Map();
  for (const c of all) { const k = norm(c.name); if (!dongs.has(k)) dongs.set(k, new Set()); dongs.get(k).add(c.sgg + c.dong); }
  return new Set([...dongs].filter(([, s]) => s.size > 1).map(([k]) => k));
}
function toLocal(D, lat, lon) {
  const KX = 111320 * Math.cos(D.lat0 * Math.PI / 180), KZ = 110950;
  return [(lon - D.lon0) * KX, (D.lat0 - lat) * KZ];
}
/* 주소 검색. accept(결과) 가 참인 첫 결과만 쓴다 (도로 한가운데·동 중심점 같은 대충 위치는 버림) */
const GEO_CACHE = path.join(ROOT, 're', 'geocode-cache.json');
let geoCache = null;
const geoLoad = () => { if (!geoCache) { try { geoCache = fs.existsSync(GEO_CACHE) ? JSON.parse(fs.readFileSync(GEO_CACHE, 'utf8')) : {}; } catch (e) { console.warn('  ! 위치 저장 파일을 못 읽어 새로 만듭니다:', e.message); geoCache = {}; } } return geoCache; };
const geoSave = () => { if (geoCache) fs.writeFileSync(GEO_CACHE, JSON.stringify(geoCache)); };
async function nominatim(D, q, accept) {
  const ck = (accept.tag || '') + '|' + q, cache = geoLoad();
  if (ck in cache) return cache[ck] ? toLocal(D, cache[ck][0], cache[ck][1]) : null;
  const res = await nominatimRaw(D, q, accept);
  if (res !== undefined) cache[ck] = res; // 오류(undefined)는 저장하지 않고 다음에 다시 시도
  return res ? toLocal(D, res[0], res[1]) : null;
}
async function nominatimRaw(D, q, accept) {
  const d = 0.05, vb = [D.lon0 - d, D.lat0 + d, D.lon0 + d, D.lat0 - d].join(',');
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=kr&accept-language=ko&bounded=1&viewbox=${vb}&q=${encodeURIComponent(q)}`;
  await sleep(1100); // 이용 정책: 초당 1회 이하
  try {
    const hit = JSON.parse(await getText(url, 2)).find(accept);
    return hit ? [+hit.lat, +hit.lon] : null;
  } catch (e) {
    console.warn('  ! 주소 검색 실패:', q, e.message);
    return undefined;
  }
}
const isBuilding = Object.assign(r => r.place_rank >= 28 && r.category !== 'highway', { tag: 'b' });
const dongBase = s => String(s).replace(/\d*가$|\d*동$/, '');
/* 이름 검색 결과가 그 동 안의 건물·단지인지 */
const inDong = dong => Object.assign(r => r.category !== 'highway' && r.place_rank >= 22 && r.display_name.includes(dongBase(dong)), { tag: 'd' });
function loadOverrides() {
  const f = path.join(ROOT, 're', 'geocode-overrides.json');
  if (!fs.existsSync(f)) return {};
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

/* ---------- 건축물대장 총괄표제부 ---------- */
const BJDONG = {
  '11590': { 노량진동: '10100', 상도동: '10200', 상도1동: '10300', 본동: '10400', 흑석동: '10500', 동작동: '10600', 사당동: '10700', 대방동: '10800', 신대방동: '10900' },
  '11560': { 영등포동: '10100', 영등포동1가: '10200', 영등포동2가: '10300', 영등포동3가: '10400', 영등포동4가: '10500', 영등포동5가: '10600', 영등포동6가: '10700', 영등포동7가: '10800', 영등포동8가: '10900', 여의도동: '11000', 당산동1가: '11100', 당산동2가: '11200', 당산동3가: '11300', 당산동4가: '11400', 당산동5가: '11500', 당산동6가: '11600', 당산동: '11700', 도림동: '11800', 문래동1가: '11900', 문래동2가: '12000', 문래동3가: '12100', 문래동4가: '12200', 문래동5가: '12300', 문래동6가: '12400', 양평동1가: '12500', 양평동2가: '12600', 양평동3가: '12700', 양평동4가: '12800', 양평동5가: '12900', 양평동6가: '13000', 양화동: '13100', 신길동: '13200', 대림동: '13300', 양평동: '13400' },
  '11170': { 후암동: '10100', 용산동2가: '10200', 용산동4가: '10300', 갈월동: '10400', 남영동: '10500', 용산동1가: '10600', 동자동: '10700', 서계동: '10800', 청파동1가: '10900', 청파동2가: '11000', 청파동3가: '11100', 원효로1가: '11200', 원효로2가: '11300', 신창동: '11400', 산천동: '11500', 청암동: '11600', 원효로3가: '11700', 원효로4가: '11800', 효창동: '11900', 도원동: '12000', 용문동: '12100', 문배동: '12200', 신계동: '12300', 한강로1가: '12400', 한강로2가: '12500', 용산동3가: '12600', 용산동5가: '12700', 한강로3가: '12800', 이촌동: '12900', 이태원동: '13000', 한남동: '13100', 동빙고동: '13200', 서빙고동: '13300', 주성동: '13400', 용산동6가: '13500', 보광동: '13600' },
  '11620': { 봉천동: '10100', 신림동: '10200', 남현동: '10300' },
};
async function fetchRecap(key, c) {
  const bj = BJDONG[c.sgg] && BJDONG[c.sgg][c.dong];
  const m = String(c.jibun).match(/^(산)?\s*(\d+)(?:-(\d+))?$/);
  if (!bj || !m) return null;
  const url = `https://apis.data.go.kr/1613000/BldRgstHubService/getBrRecapTitleInfo?serviceKey=${encodeURIComponent(key)}` +
    `&sigunguCd=${c.sgg}&bjdongCd=${bj}&platGbCd=${m[1] ? 1 : 0}&bun=${m[2].padStart(4, '0')}&ji=${(m[3] || '0').padStart(4, '0')}&numOfRows=10&pageNo=1&_type=json`;
  try {
    const j = JSON.parse(await getText(url, 2));
    let it = j?.response?.body?.items?.item;
    if (!it) return null;
    if (Array.isArray(it)) it = [...it].sort((a, b) => (b.hhldCnt || 0) - (a.hhldCnt || 0))[0];
    if (!it) return null; // 빈 목록(대장 없음)
    return {
      hh: it.hhldCnt || 0, bld: it.mainBldCnt || 0, park: it.totPkngCnt || 0, far: it.vlRat || 0, bcr: it.bcRat || 0,
      use: String(it.useAprDay || '').trim(), addr: String(it.newPlatPlc || '').trim(), bname: String(it.bldNm || '').trim(),
    };
  } catch (e) {
    console.warn('  ! 건축물대장 실패:', c.name, e.message);
    return null;
  }
}

/* ---------- 통계 ---------- */
function stats(c) {
  const pp = c.T.map(t => t[3] / (t[1] / PY));
  const jeon = c.R.filter(r => r[4] === 0);
  const jpp = jeon.map(r => r[3] / (r[1] / PY));
  const sorted = [...c.T].sort((a, b) => a[0] - b[0]);
  const half = sorted.length >> 1;
  const ppOf = t => t[3] / (t[1] / PY);
  const recent = median(sorted.slice(half).map(ppOf)), prev = median(sorted.slice(0, half).map(ppOf));
  const ppm = Math.round(median(pp)), jpm = Math.round(median(jpp));
  return {
    n: c.T.length, nr: c.R.length, pp: ppm, jpp: jpm,
    jr: ppm && jpm ? Math.round(jpm / ppm * 100) : 0,
    chg: c.T.length >= 6 && prev ? Math.round((recent / prev - 1) * 1000) / 10 : null,
    max: c.T.reduce((m, t) => Math.max(m, t[3]), 0),
  };
}

/* ---------- 역 목록 (브리핑 페이지의 '가까운 역'용): [이름, x, z] ---------- */
function stationsOf(D, R) {
  const out = [];
  for (const [name, x, z, kind] of D.ST || []) {
    if (Math.hypot(x, z) > R * 1.02 || /bus|tram/.test(kind || '')) continue;
    const nm = (name || '역').replace(/\(.*\)/, '').trim(), full = nm.endsWith('역') ? nm : nm + '역';
    if (out.some(s => s[0] === full && Math.hypot(s[1] - x, s[2] - z) < 400)) continue;
    out.push([full, Math.round(x), Math.round(z)]);
  }
  return out;
}

/* ---------- 실행 ---------- */
async function main() {
  const env = loadEnv();
  const raw = fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8');
  const D = JSON.parse(raw.slice(raw.indexOf('=') + 1).trim().replace(/;$/, ''));
  if (!D.lat0) throw new Error('data.js 에 기준 좌표(lat0)가 없습니다. 먼저 지도 데이터를 만들어 주세요.');
  const R = D.r || 3000, months = monthList(MONTHS);
  fs.mkdirSync(path.join(ROOT, 're'), { recursive: true });
  console.log(`기준: ${D.place} (${D.lat0}, ${D.lon0}) 반경 ${R} m · 기간 ${months[0]}~${months.at(-1)}`);

  console.log('1) 실거래가 받기');
  const { trades, rents } = await collectDeals(env.DATA_GO_KR_API_KEY, months);
  const all = groupComplexes(trades, rents);
  console.log(`   단지 ${all.length}곳`);

  console.log('2) 위치 찾기');
  const idx = buildNameIndex(D), ovr = loadOverrides(), miss = [], amb = ambiguousNames(all);
  const kept = [];
  /* 순서: 직접 지정 → (이름이 하나뿐일 때) 지도 속 단지 이름 → 도로명 주소 → 지번 주소. 이름만으로 주소 검색은 하지 않는다(엉뚱한 곳에 찍힘). */
  let done = 0;
  for (const c of all) {
    if (++done % 50 === 0) { console.log(`   ${done}/${all.length}`); geoSave(); }
    let pt = null, how = '';
    if (ovr[c.key]) { pt = toLocal(D, ovr[c.key][0], ovr[c.key][1]); how = 'manual'; }
    if (!pt && !amb.has(norm(c.name))) { const m = matchOSM(idx, c.name); if (m) { pt = m.pt; how = 'osm'; } }
    if (!pt && c.T.length + c.R.length >= 3) {
      const city = '서울특별시 ' + SGG[c.sgg];
      if (c.road) { pt = await nominatim(D, `${city} ${c.road}`, isBuilding); how = 'road'; }
      if (!pt && /^\d+(-\d+)?$/.test(c.jibun)) { pt = await nominatim(D, `${city} ${c.dong} ${c.jibun}`, isBuilding); how = 'jibun'; }
      if (!pt) { pt = await nominatim(D, `${c.dong} ${c.name}`, inDong(c.dong)); how = 'name+dong'; }
      if (!pt) how = '';
    }
    if (!pt) { miss.push(c); continue; }
    if (Math.hypot(pt[0], pt[1]) > R * 1.05) continue;
    c.x = Math.round(pt[0] * 10) / 10; c.z = Math.round(pt[1] * 10) / 10; c.how = how;
    kept.push(c);
  }
  geoSave();
  console.log(`   반경 안 ${kept.length}곳 · 위치 못 찾음 ${miss.length}곳`);
  fs.writeFileSync(path.join(ROOT, 're', 'geocode-missing.json'),
    JSON.stringify(miss.filter(c => c.T.length >= 3).map(c => ({ key: c.key, name: c.name, road: c.road, deals: c.T.length })), null, 1));

  if (kept.length < 10) throw new Error(`위치를 찾은 단지가 ${kept.length}곳뿐입니다. 결과가 이상해 기존 re-data.js 를 덮어쓰지 않습니다.`);
  console.log('3) 건축물대장 받기');
  const bkey = env.BUILDING_REGISTER_API_KEY || env.DATA_GO_KR_API_KEY;
  let i = 0;
  for (const c of kept) { c.reg = await fetchRecap(bkey, c); if (++i % 20 === 0 || i === kept.length) console.log(`   ${i}/${kept.length}`); }

  console.log('4) 사무소 위치');
  const office = { ...OFFICE, x: 0, z: 0, how: '' };
  const road = (D.H || []).find(h => h[3] === OFFICE.road);
  const KXo = 111320 * Math.cos(D.lat0 * Math.PI / 180), KZo = 110950;
  const og = OFFICE.lat ? null : await nominatim(D, OFFICE.addr, isBuilding);
  if (OFFICE.lat) { office.x = +((OFFICE.lon - D.lon0) * KXo).toFixed(1); office.z = +((D.lat0 - OFFICE.lat) * KZo).toFixed(1); office.how = 'vworld'; delete office.lat; delete office.lon; }
  else if (og) { [office.x, office.z] = og; office.how = 'nominatim'; }
  else if (road) { const f = road[4], k = (f.length / 4 | 0) * 2; office.x = f[k]; office.z = f[k + 1]; office.how = 'road'; }
  console.log(`   ${office.how || '못 찾음'} (${office.x.toFixed(0)}, ${office.z.toFixed(0)})`);

  const out = {
    ST: stationsOf(D, R),
    meta: { at: new Date().toISOString(), months: [months[0], months.at(-1)], center: D.place, r: R, lat0: D.lat0, lon0: D.lon0,
      src: '국토교통부 아파트 매매·전월세 실거래가, 건축HUB 건축물대장(총괄표제부) · 공공데이터포털 · 공공누리 제1유형' },
    office,
    C: kept.map(c => ({
      id: c.key, name: c.name, sgg: SGG[c.sgg], dong: c.dong, jibun: c.jibun, road: c.road, by: c.by, x: c.x, z: c.z, how: c.how,
      reg: c.reg, s: stats(c), T: c.T.sort((a, b) => a[0] - b[0]), R: c.R.sort((a, b) => a[0] - b[0]),
    })),
  };
  fs.mkdirSync(path.dirname(path.join(ROOT, OUT)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, OUT),
    `/* 부동산 공공데이터 · ${out.meta.src} · tools/bake-realestate.mjs 로 생성 */\nwindow.RE_DATA=${JSON.stringify(out)};\n`);
  console.log(`저장: ${OUT} (${(fs.statSync(path.join(ROOT, OUT)).size / 1024).toFixed(0)} KB, 단지 ${out.C.length}곳)`);
}

main().catch(e => { console.error('실패:', e.message); process.exit(1); });
