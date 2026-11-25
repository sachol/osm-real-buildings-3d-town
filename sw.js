/* 오프라인 저장(서비스 워커): 이 사이트 파일만 저장한다. 공공데이터 API 등 다른 사이트 요청은 건드리지 않는다.
   - 정상 응답(200)만 저장하고, 주소 뒤 ?focus=… 같은 꼬리는 떼고 한 칸에 저장한다.
   - 화면(HTML)·스크립트 모두 새 버전을 먼저 받고, 인터넷이 안 될 때만 저장본을 쓴다(HTML과 스크립트 버전이 섞이지 않게).
   - 새로 배포할 때 아래 CACHE 이름의 숫자를 올리면 예전 저장본이 지워진다. */
const CACHE = 'town3d-re-v2';
const SHELL = ['./brief.html', './re/brief.css', './re/brief.js', './re/re-core.js', './re/re-config.js', './re/re-data.js', './icons/icon.svg', './icons/icon-192.png', './manifest.webmanifest'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k.startsWith('town3d-re-')).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const bare = req => { const u = new URL(req.url); u.search = ''; u.hash = ''; return u.href; };

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const key = bare(req);
  e.respondWith(fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); e.waitUntil(caches.open(CACHE).then(c => c.put(key, copy)).catch(err => console.warn('[sw] 저장 실패:', key, err.message))); }
    return r;
  }).catch(async err => {
    console.warn('[sw] 인터넷 연결 없음, 저장본 사용:', key, err.message);
    const hit = await caches.match(key);
    if (hit) return hit;
    if (req.mode === 'navigate' && url.pathname.endsWith('brief.html')) return caches.match('./brief.html');
    return new Response('인터넷에 연결되어 있지 않습니다.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }));
});
