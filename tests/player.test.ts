import { describe, expect, test } from 'bun:test'
const { clampSkip, getCurrentChapterIdx, progressKey, formatTime, sleepTimerMs, trackUrl } = require('../public/player-utils.js')

describe('clampSkip', () => {
  test('clamps to 0 when skipping before start', () => {
    expect(clampSkip(10, -30, 300)).toBe(0)
  })
  test('clamps to duration when skipping past end', () => {
    expect(clampSkip(290, 30, 300)).toBe(300)
  })
  test('normal forward skip', () => {
    expect(clampSkip(100, 30, 300)).toBe(130)
  })
  test('normal backward skip', () => {
    expect(clampSkip(100, -30, 300)).toBe(70)
  })
})

describe('getCurrentChapterIdx', () => {
  const chapters = [
    { start_sec: 0, end_sec: 60 },
    { start_sec: 60, end_sec: 120 },
    { start_sec: 120, end_sec: 180 },
  ]
  test('returns 0 at start', () => {
    expect(getCurrentChapterIdx(0, chapters)).toBe(0)
  })
  test('returns 0 just before chapter 2', () => {
    expect(getCurrentChapterIdx(59.9, chapters)).toBe(0)
  })
  test('returns 1 at chapter 2 boundary', () => {
    expect(getCurrentChapterIdx(60, chapters)).toBe(1)
  })
  test('returns last chapter for time in last chapter', () => {
    expect(getCurrentChapterIdx(150, chapters)).toBe(2)
  })
  test('returns 0 for negative time', () => {
    expect(getCurrentChapterIdx(-1, chapters)).toBe(0)
  })
  test('returns 0 for empty chapters', () => {
    expect(getCurrentChapterIdx(50, [])).toBe(0)
  })
})

describe('progressKey', () => {
  test('formats username::bookId', () => {
    expect(progressKey('alice', 42)).toBe('alice::42')
  })
  test('works with different inputs', () => {
    expect(progressKey('bob', 1)).toBe('bob::1')
  })
})

describe('formatTime', () => {
  test('formats zero', () => {
    expect(formatTime(0)).toBe('0:00')
  })
  test('formats minutes and seconds', () => {
    expect(formatTime(65)).toBe('1:05')
  })
  test('formats hours', () => {
    expect(formatTime(3661)).toBe('1:01:01')
  })
  test('handles negative', () => {
    expect(formatTime(-5)).toBe('0:00')
  })
  test('handles null', () => {
    expect(formatTime(null)).toBe('0:00')
  })
})

describe('sleepTimerMs', () => {
  test('converts 5 minutes', () => {
    expect(sleepTimerMs(5)).toBe(300000)
  })
  test('converts 60 minutes', () => {
    expect(sleepTimerMs(60)).toBe(3600000)
  })
})

describe('trackUrl', () => {
  test('builds URL from numeric bookId and chapterIdx', () => {
    expect(trackUrl(42, 0)).toBe('/api/books/42/audio/0')
  })
  test('builds URL for non-zero chapter index', () => {
    expect(trackUrl(1, 5)).toBe('/api/books/1/audio/5')
  })
  test('handles string bookId via concatenation', () => {
    expect(trackUrl('7', 3)).toBe('/api/books/7/audio/3')
  })
})
