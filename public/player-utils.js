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

// Export for both browser global and module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { clampSkip, getCurrentChapterIdx, progressKey, formatTime, sleepTimerMs }
}
