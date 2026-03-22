importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.4.0/workbox-sw.js')

workbox.precaching.precacheAndRoute([
  { url: '/index.html', revision: '1' },
  { url: '/style.css', revision: '1' },
  { url: '/manifest.json', revision: '1' },
  { url: '/icons/icon-192.png', revision: '1' },
  { url: '/icons/icon-512.png', revision: '1' }
])

workbox.routing.registerRoute(
  ({ url }) => url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/'),
  new workbox.strategies.NetworkFirst({ cacheName: 'api-cache' })
)
