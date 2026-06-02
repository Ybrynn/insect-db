// 昆虫信息数据库 - Service Worker (PWA)
const CACHE_NAME = 'insect-db-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.ico'
];

// 安装事件：缓存核心文件
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

// 激活事件：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    })
  );
});

// 请求拦截：缓存优先策略（API 请求走网络）
self.addEventListener('fetch', (event) => {
  // API 请求和上传文件不走缓存
  if (event.request.url.includes('/api/') || event.request.url.includes('/uploads/')) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
