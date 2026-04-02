// public/player-utils.js
// Pure utility functions for the Spine audio player.
// Loaded by index.html via <script> and imported by tests.

/**
 * Clamp a skip operation to [0, duration].
 * @param {number} currentTime
 * @param {number} delta - seconds to skip (positive or negative)
 * @param {number} duration - total duration
 * @returns {number} clamped time
 */
function clampSkip(currentTime, delta, duration) {
  return Math.max(0, Math.min(currentTime + delta, duration))
}

/**
 * Find the current chapter index for a given playback time.
 * Iterates backwards to find the last chapter where currentTime >= start_sec.
 * @param {number} currentTime
 * @param {Array<{start_sec: number, end_sec: number}>} chapters
 * @returns {number} chapter index (0-based)
 */
function getCurrentChapterIdx(currentTime, chapters) {
  if (!chapters || chapters.length === 0) return 0
  for (let i = chapters.length - 1; i >= 0; i--) {
    if (currentTime >= chapters[i].start_sec) return i
  }
  return 0
}

/**
 * Build the IndexedDB key for progress storage.
 * @param {string} username
 * @param {number|string} bookId
 * @returns {string} composite key
 */
function progressKey(username, bookId) {
  return username + '::' + bookId
}

/**
 * Format seconds into h:mm:ss or m:ss display string.
 * @param {number|null} sec
 * @returns {string}
 */
function formatTime(sec) {
  if (!sec || sec < 0) sec = 0
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  return h > 0
    ? h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s
    : m + ':' + (s < 10 ? '0' : '') + s
}

/**
 * Convert minutes to milliseconds for setTimeout.
 * @param {number} minutes
 * @returns {number} milliseconds
 */
function sleepTimerMs(minutes) {
  return minutes * 60 * 1000
}

/**
 * Build a plain object suitable for navigator.mediaSession.metadata.
 * Returns a plain object (NOT a MediaMetadata instance) so it can be unit-tested
 * outside a browser environment.
 * @param {{ title: string, author: string|null, cover_url: string|null, chapters: Array<{title: string}> }} book
 * @param {number} chapterIdx - zero-based chapter index
 * @returns {{ title: string, artist: string, album: string, artwork: Array }} metadata object
 */
function buildMediaMetadata(book, chapterIdx) {
  if (!book) return null
  const chapters = book.chapters || []
  const ch = chapters[chapterIdx] || null
  const chNum = chapterIdx + 1
  const total = chapters.length
  const chLabel = ch ? ch.title : ''
  const title = total > 1
    ? book.title + ' (' + chNum + '/' + total + ')' + (chLabel ? ' ' + chLabel : '')
    : book.title
  const coverSrc = book.cover_url ?? '/images/default-cover.svg'
  const coverType = book.cover_url ? 'image/jpeg' : 'image/svg+xml'
  return {
    title,
    artist: book.author ?? '',
    album: book.title,
    artwork: [
      { src: coverSrc, sizes: '96x96', type: coverType },
      { src: coverSrc, sizes: '512x512', type: coverType },
    ],
  }
}

/**
 * Compute chapter-relative position state for navigator.mediaSession.setPositionState().
 * Scrubber is scoped to the current chapter (0 to chapter duration). Decision D-04.
 * @param {{ start_sec: number, end_sec: number }|null} chapter
 * @param {number} currentTime - absolute audio currentTime in seconds
 * @param {number} playbackRate - current playback rate
 * @returns {{ duration: number, playbackRate: number, position: number }|null}
 */
function chapterPositionState(chapter, currentTime, playbackRate) {
  if (!chapter) return null
  const chDuration = chapter.end_sec - chapter.start_sec
  const rawPosition = currentTime - chapter.start_sec
  const position = Math.max(0, Math.min(rawPosition, chDuration))
  return {
    duration: chDuration,
    playbackRate: playbackRate,
    position: position,
  }
}

/**
 * Convert a chapter-relative seekTime to an absolute audio time.
 * Used by the 'seekto' Media Session action handler. Decision D-06.
 * @param {{ start_sec: number }|null} chapter
 * @param {number} seekTime - chapter-relative offset in seconds
 * @returns {number|null} absolute audio time or null if no chapter
 */
function seektoAbsolute(chapter, seekTime) {
  if (!chapter) return null
  return chapter.start_sec + seekTime
}

/**
 * Format a byte count as a human-readable string (KB, MB, or GB).
 * @param {number|null|undefined} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (!bytes) return '0 MB'
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB'
  if (bytes >= 1048576) return Math.round(bytes / 1048576) + ' MB'
  return Math.round(bytes / 1024) + ' KB'
}

/**
 * IndexedDB wrapper for offline download metadata.
 * Follows the same IIFE pattern as progressDB used in index.html.
 * DB: 'spine-downloads', store: 'downloads', keyed by bookId string.
 * NOTE: IndexedDB is browser-only — not usable in Bun tests.
 */
var downloadDB = (() => {
  const DB_NAME = 'spine-downloads'
  const DB_VERSION = 1
  const STORE = 'downloads'
  let _db = null

  function open() {
    if (_db) return Promise.resolve(_db)
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE)
      req.onsuccess = (e) => { _db = e.target.result; resolve(_db) }
      req.onerror = (e) => reject(e.target.error)
    })
  }

  async function get(bookId) {
    const db = await open()
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(String(bookId))
      req.onsuccess = (e) => resolve(e.target.result || null)
      req.onerror = (e) => reject(e.target.error)
    })
  }

  async function getAll() {
    const db = await open()
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
      req.onsuccess = (e) => resolve(e.target.result || [])
      req.onerror = (e) => reject(e.target.error)
    })
  }

  async function getAllKeys() {
    const db = await open()
    return new Promise((resolve, reject) => {
      const keys = []
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).openKeyCursor()
      req.onsuccess = (e) => {
        const cursor = e.target.result
        if (cursor) { keys.push(cursor.key); cursor.continue() }
        else resolve(keys)
      }
      req.onerror = (e) => reject(e.target.error)
    })
  }

  async function save(bookId, data) {
    const db = await open()
    return new Promise((resolve, reject) => {
      const val = Object.assign({ bookId: String(bookId) }, data)
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(val, String(bookId))
      req.onsuccess = () => resolve()
      req.onerror = (e) => reject(e.target.error)
    })
  }

  async function del(bookId) {
    const db = await open()
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(String(bookId))
      req.onsuccess = () => resolve()
      req.onerror = (e) => reject(e.target.error)
    })
  }

  return { open, get, getAll, getAllKeys, save, delete: del }
})()

/**
 * Build the URL for an MP3 book's track audio.
 * @param {number|string} bookId
 * @param {number} chapterIdx - zero-based track index
 * @returns {string} URL path
 */
function trackUrl(bookId, chapterIdx) {
  return '/api/books/' + bookId + '/audio/' + chapterIdx
}

/**
 * Reconcile a list of downloaded bookIds against what is actually in Cache Storage.
 * Pure function — takes injected callbacks so it is testable without browser APIs.
 * @param {string[]} bookIds - IDs currently tracked in IndexedDB
 * @param {(bookId: string) => boolean} cacheLookupFn - returns true if cache entry exists
 * @param {(bookId: string) => any} deleteFn - called for each stale entry
 * @returns {Promise<string[]>} valid bookIds (those still in cache)
 */
async function reconcileDownloads(bookIds, cacheLookupFn, deleteFn) {
  const valid = []
  for (const id of bookIds) {
    if (cacheLookupFn(id)) {
      valid.push(id)
    } else {
      await deleteFn(id)
    }
  }
  return valid
}

// Export for both browser global and module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { clampSkip, getCurrentChapterIdx, progressKey, formatTime, sleepTimerMs, buildMediaMetadata, chapterPositionState, seektoAbsolute, formatBytes, downloadDB, reconcileDownloads, trackUrl }
}
