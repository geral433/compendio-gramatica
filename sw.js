/* Compêndio da Gramática de Português — service worker
   Estratégia: a página (todo o conteúdo) vem SEMPRE primeiro da internet quando há ligação,
   e é guardada; sem ligação, usa-se a última cópia guardada. */
const VERSION = '0.11';
const CACHE = 'compendio-' + VERSION;
const FONT_CACHE = 'compendio-fontes';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './maskable-512.png', './apple-touch-icon.png', './favicon-32.png'];
const FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Patrick+Hand&display=swap';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })));
    try { await Promise.race([cacheFonts(), timeout(8000)]); } catch (e) { /* sem ligação às fontes: usa as do sistema */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('compendio-') && k !== CACHE && k !== FONT_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function cacheFonts() {
  const fc = await caches.open(FONT_CACHE);
  if (await fc.match(FONTS_CSS)) return;
  const res = await fetch(FONTS_CSS, { mode: 'cors' });
  if (!res.ok) return;
  const css = await res.clone().text();
  await fc.put(FONTS_CSS, res);
  const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m => m[1]);
  await Promise.all(urls.map(async u => { try { const r = await fetch(u, { mode: 'cors' }); if (r.ok) await fc.put(u, r); } catch (e) {} }));
}

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

async function networkFirst(req) {
  const c = await caches.open(CACHE);
  try {
    const fresh = await Promise.race([fetch(req, { cache: 'no-store' }), timeout(6000)]);
    if (fresh && fresh.ok) { c.put(req.mode === 'navigate' ? './index.html' : req, fresh.clone()); return fresh; }
    throw new Error('bad');
  } catch (e) {
    return (await c.match(req, { ignoreSearch: true })) || (await c.match('./index.html')) || Response.error();
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const c = await caches.open(cacheName);
  const hit = await c.match(req);
  const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => null);
  return hit || (await net) || Response.error();
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(req, FONT_CACHE));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('.webmanifest')) {
    event.respondWith(networkFirst(req));
    return;
  }
  event.respondWith(staleWhileRevalidate(req, CACHE));
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
