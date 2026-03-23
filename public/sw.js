importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.4.0/workbox-sw.js')

// Activate new service worker immediately — don't wait for old tabs to close
self.addEventListener('install', () => self.skipWaiting())
workbox.core.clientsClaim()

workbox.precaching.precacheAndRoute([
  { url: '/index.html', revision: '3' },
  { url: '/style.css', revision: '3' },
  { url: '/manifest.json', revision: '1' },
  { url: '/icons/icon-192.png', revision: '1' },
  { url: '/icons/icon-512.png', revision: '1' },
  { url: '/player-utils.js', revision: '3' }
])

// IMPORTANT: Instantiate at top level so workbox-sw auto-loads modules (Pitfall 2)
const audioCacheFirst = new workbox.strategies.CacheFirst({
  cacheName: 'spine-audio',
  plugins: [
    new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [200] }),
    new workbox.rangeRequests.RangeRequestsPlugin(),
  ],
})

// Audio: CacheFirst for downloaded books — RangeRequestsPlugin slices cached 200 into 206
workbox.routing.registerRoute(
  ({ url }) => url.pathname.match(/^\/api\/books\/\d+\/audio$/),
  audioCacheFirst
)

// Cover art: CacheFirst — proactively cached on library load, always available offline (D-14)
workbox.routing.registerRoute(
  ({ url }) => url.pathname.match(/^\/api\/books\/\d+\/cover$/),
  new workbox.strategies.CacheFirst({ cacheName: 'spine-covers' })
)

// API: NetworkFirst for all other /api/ and /auth/ routes
workbox.routing.registerRoute(
  ({ url }) => url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/'),
  new workbox.strategies.NetworkFirst({ cacheName: 'api-cache' })
)
