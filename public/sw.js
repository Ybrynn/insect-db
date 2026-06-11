// 昆虫信息数据库 - Service Worker (PWA)
const CACHE_NAME = 'insect-db-v7';

// 安装：预缓存核心文件
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(['/icon-192.png', '/icon-512.png', '/favicon.ico']);
    })
  );
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
  self.registration.unregister();
  clients.claim();
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    })
  );
});

// 请求拦截：网络优先，离线回退缓存
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});