// ==================== Service Worker — ParmisApp (نسخه ۲۰.۲ — آماده برای PWABuilder و APK اندروید) ====================
const CACHE_NAME = 'parmisapp-static-v20-3';
const CORE_ASSETS = [
    './',
    './index.html',
    './style.css',
    './db.js',
    './app.js',
    './game-draw.html',
    './game-draw.css',
    './game-draw.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    './icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(CORE_ASSETS).catch(() => {}))
            .catch(() => {})
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// دریافت پیام‌ها از صفحه اصلی (آپدیت فوری و نمایش نوتیفیکیشن محلی)
self.addEventListener('message', (event) => {
    const data = event.data || {};
    if (data.type === 'SKIP_WAITING') {
        self.skipWaiting();
        return;
    }
    if (data.type === 'SHOW_NOTIFICATION') {
        const title = data.title || 'پیام جدید 💙';
        const options = {
            body: data.body || '',
            icon: './icon-192.png',
            badge: './icon-192.png',
            dir: 'rtl',
            lang: 'fa',
            tag: data.tag || 'parmis-notif',
            renotify: true,
            data: { targetView: data.targetView || 'chat' }
        };
        event.waitUntil(self.registration.showNotification(title, options));
    }
});

// کلیک روی نوتیفیکیشن و باز کردن بخش هدف داخل اپ
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetView = (event.notification.data && event.notification.data.targetView) || 'chat';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) {
                    client.focus();
                    client.postMessage({ type: 'OPEN_TARGET_VIEW', targetView });
                    return;
                }
            }
            if (self.clients.openWindow) {
                return self.clients.openWindow(`./index.html?view=${encodeURIComponent(targetView)}`);
            }
        })
    );
});

// استراتژی باز شدن آنی (Stale-While-Revalidate) برای فایل‌های استاتیک همین دامنه
// بدون خطای waitUntil و بدون هیچ دخالتی در درخواست‌های Supabase، WebSocket و CDNها
self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    let url;
    try {
        url = new URL(req.url);
    } catch (e) {
        return;
    }

    if (url.origin !== self.location.origin) return;

    const networkUpdate = fetch(req)
        .then((networkRes) => {
            if (networkRes && networkRes.ok && networkRes.type === 'basic') {
                const copy = networkRes.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
            }
            return networkRes;
        })
        .catch(() => null);

    event.waitUntil(networkUpdate);

    event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
            const cachedRes = await cache.match(req);
            if (cachedRes) return cachedRes;

            const networkRes = await networkUpdate;
            if (networkRes) return networkRes;

            if (req.mode === 'navigate') {
                const fallback = await cache.match('./index.html');
                if (fallback) return fallback;
            }
            return new Response('', { status: 504, statusText: 'Offline' });
        })
    );
});
