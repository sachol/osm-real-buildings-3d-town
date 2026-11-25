/* 3D 지도(index.html)와 모바일 브리핑(brief.html)이 함께 쓰는 계산 도구 */
(() => {
  const RE = window.RE = window.RE || {};
  const PY = 3.305785; // 1평 = 3.305785㎡

  RE.el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  RE.median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  /* 만원 단위 금액 → '12.5억' / '8,500만' */
  RE.won = v => v >= 10000 ? (v / 10000).toFixed(v >= 100000 ? 1 : 2).replace(/\.?0+$/, '') + '억' : Math.round(v).toLocaleString() + '만';

  /* 전용면적 구분 */
  RE.BANDS = { all: ['전체', () => true], s: ['~60㎡', a => a <= 60], m: ['60~85㎡', a => a > 60 && a <= 85], l: ['85㎡~', a => a > 85] };

  /* 단지 하나의 요약: 거래 수, 평당가·전세 평당가 중앙값, 전세가율, 전반 6개월 대비 후반 변동률 */
  RE.statsFor = (c, band = 'all') => {
    const ok = RE.BANDS[band][1], med = RE.median;
    const T = c.T.filter(t => t[1] > 0 && ok(t[1])), J = c.R.filter(r => r[1] > 0 && r[4] === 0 && ok(r[1])); // 면적이 비어 있는 거래는 제외
    const ppOf = t => t[3] / (t[1] / PY);
    const pp = Math.round(med(T.map(ppOf))), jpp = Math.round(med(J.map(r => r[3] / (r[1] / PY))));
    const half = T.length >> 1, prev = med(T.slice(0, half).map(ppOf)), recent = med(T.slice(half).map(ppOf));
    return { n: T.length, nj: J.length, pp, jpp, jr: pp && jpp ? Math.round(jpp / pp * 100) : 0,
      chg: T.length >= 6 && prev ? Math.round((recent / prev - 1) * 1000) / 10 : null };
  };

  /* 준공연도: 건축물대장 사용승인일 우선, 없으면 실거래 건축연도 */
  RE.builtYear = c => (c.reg && c.reg.use && c.reg.use.length >= 4 ? +c.reg.use.slice(0, 4) : c.by) || 0;
  /* 도보 분: 직선거리 × 1.25(길 돌아감) ÷ 분당 보행거리 */
  RE.walkMin = (d, speed) => Math.round(d * 1.25 / (speed || 75));
})();
