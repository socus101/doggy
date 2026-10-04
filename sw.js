/* ============================================================
   Doggy — Service Worker
   ทำให้แอปเปิดใช้งานได้เต็มรูปแบบแม้ไม่มีเน็ต
   ------------------------------------------------------------
   ⚠️ ทุกครั้งที่แก้ไฟล์ doggy_webapp.html ให้เปลี่ยนเลข CACHE_VERSION
      ด้านล่างนี้ (เช่น v1 -> v2) แล้ว push ขึ้น GitHub
      ไม่งั้นแท็บเล็ตจะยังใช้ไฟล์เก่าที่แคชไว้
   ============================================================ */

const CACHE_VERSION = 'doggy-v2';

const PRECACHE_URLS = [
  './',
  './index.html',
  './doggy_webapp.html',
  './manifest.json',
  './vendor/chart.umd.min.js',
  './vendor/html2canvas.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png'
];

// ---------- ติดตั้ง: ดาวน์โหลดทุกไฟล์เก็บลงเครื่อง ----------
// ใช้ทีละไฟล์แทน cache.addAll() เพราะถ้า addAll พลาดแค่ไฟล์เดียว
// การติดตั้งจะล้มทั้งหมด แล้วแอปจะใช้ออฟไลน์ไม่ได้เลย
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache =>
      Promise.all(PRECACHE_URLS.map(url =>
        cache.add(new Request(url, { cache: 'reload' }))
             .catch(err => console.warn('[SW] แคชไม่สำเร็จ:', url, err))
      ))
    ).then(() => self.skipWaiting())
  );
});

// ---------- เปิดใช้งาน: ลบแคชเวอร์ชันเก่าทิ้ง ----------
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ---------- ดักจับทุก request ----------
self.addEventListener('fetch', event => {
  const req = event.request;

  // ส่งข้อมูลขึ้น Google Sheets / Apps Script — อย่าแคช ต้องวิ่งผ่านเน็ตจริงเท่านั้น
  if (req.method !== 'GET' || req.url.includes('script.google.com')) {
    return;
  }

  // ไฟล์ตัวแอปเอง: ใช้ Network-first เพื่อให้ได้เวอร์ชันใหม่เมื่อมีเน็ต
  // แต่ถ้าไม่มีเน็ต ดึงจากแคชทันที
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req)
          .then(hit => hit || caches.match('./doggy_webapp.html')))
    );
    return;
  }

  // ไฟล์อื่น ๆ (ไลบรารี, ไอคอน): Cache-first เร็วและทำงานออฟไลน์ได้เสมอ
  event.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        // แคชเฉพาะไฟล์ในโดเมนเดียวกันที่โหลดสำเร็จ
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => undefined); // ออฟไลน์และไม่มีในแคช เช่น ฟอนต์ Google — ปล่อยผ่าน
    })
  );
});
