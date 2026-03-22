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
  const title = ch
    ? book.title + ' -- Ch. ' + chNum + ': ' + ch.title
    : book.title
  const coverSrc = book.cover_url ?? '/images/default-cover.svg'
  const coverType = book.cover_url ? 'image/jpeg' : 'image/svg+xml'
  return {
    title,
    artist: book.author ?? '',
    album: '',
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

// Export for both browser global and module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { clampSkip, getCurrentChapterIdx, progressKey, formatTime, sleepTimerMs, buildMediaMetadata, chapterPositionState, seektoAbsolute }
}
