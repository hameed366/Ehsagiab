// Service Worker: يحفظ هيكل التطبيق ليفتح بسرعة وبلا إنترنت، ولا يخزّن أي بيانات غياب
const V = 'absence-v3';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
const LIBS = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  // المكتبات المحلية تُحفظ إن وُجدت، ولا يفشل التثبيت إن لم توجد
  const OPT = ['libs/xlsx.full.min.js', 'libs/exceljs.min.js', 'libs/qrcode.js'];
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL).then(() => Promise.all(OPT.map(u => c.add(u).catch(() => {}))))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;                       // الرصد (POST) لا يمرّ عبر الكاش
  const u = new URL(r.url);
  if (u.hostname.endsWith('script.google.com') || u.hostname.endsWith('googleusercontent.com')) return;
  if (r.mode === 'navigate') {                          // الصفحة: الأحدث من الشبكة، وإلا النسخة المحفوظة
    e.respondWith(
      fetch(r, { cache: 'no-cache' }).then(x => { const c = x.clone(); caches.open(V).then(k => k.put('index.html', c)); return x; })
        .catch(() => caches.match('index.html'))
    );
    return;
  }
  if (u.origin === location.origin || LIBS.indexOf(u.hostname) >= 0) {
    e.respondWith(
      caches.match(r).then(h => h || fetch(r, { cache: 'no-cache' }).then(x => {
        if (x.ok || x.type === 'opaque') { const c = x.clone(); caches.open(V).then(k => k.put(r, c)); }
        return x;
      }))
    );
  }
});
