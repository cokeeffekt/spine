import { describe, expect, test } from 'bun:test'
const { buildMediaMetadata, chapterPositionState, seektoAbsolute } = require('../public/player-utils.js')

// ── buildMediaMetadata ────────────────────────────────────────────────────────

describe('buildMediaMetadata', () => {
  const chapters = [
    { title: 'Chapter One', start_sec: 0, end_sec: 600 },
    { title: 'Chapter Two', start_sec: 600, end_sec: 1200 },
  ]
  const book = {
    title: 'Book Title',
    author: 'Author Name',
    cover_url: '/api/books/42/cover',
    chapters,
  }

  test('Test 1: title format is "{Book Title} (N/Total) {Chapter Name}"', () => {
    const meta = buildMediaMetadata(book, 0)
    expect(meta.title).toBe('Book Title (1/2) Chapter One')
    expect(meta.artist).toBe('Author Name')
    expect(meta.album).toBe('Book Title')
  })

  test('Test 2: artwork has 2 entries with correct sizes and src', () => {
    const meta = buildMediaMetadata(book, 0)
    expect(meta.artwork).toHaveLength(2)
    expect(meta.artwork[0]).toEqual({ src: '/api/books/42/cover', sizes: '96x96', type: 'image/jpeg' })
    expect(meta.artwork[1]).toEqual({ src: '/api/books/42/cover', sizes: '512x512', type: 'image/jpeg' })
  })

  test('Test 3: when cover_url is null, uses default-cover.svg with image/svg+xml', () => {
    const nocover = { ...book, cover_url: null }
    const meta = buildMediaMetadata(nocover, 0)
    expect(meta.artwork[0].src).toBe('/images/default-cover.svg')
    expect(meta.artwork[0].type).toBe('image/svg+xml')
    expect(meta.artwork[1].src).toBe('/images/default-cover.svg')
    expect(meta.artwork[1].type).toBe('image/svg+xml')
  })

  test('Test 4: when chapters is empty, title is just the book title with no chapter suffix', () => {
    const noChapters = { ...book, chapters: [] }
    const meta = buildMediaMetadata(noChapters, 0)
    expect(meta.title).toBe('Book Title')
  })

  test('Test 5: when author is null, artist is empty string', () => {
    const noAuthor = { ...book, author: null }
    const meta = buildMediaMetadata(noAuthor, 0)
    expect(meta.artist).toBe('')
  })
})

// ── chapterPositionState ──────────────────────────────────────────────────────

describe('chapterPositionState', () => {
  const chapter = { title: 'Chapter One', start_sec: 100, end_sec: 700 }

  test('Test 6: returns duration, playbackRate, and chapter-relative position', () => {
    const state = chapterPositionState(chapter, 400, 1.5)
    expect(state).toEqual({ duration: 600, playbackRate: 1.5, position: 300 })
  })

  test('Test 7: clamps position to 0 when currentTime is before chapter start', () => {
    const state = chapterPositionState(chapter, 50, 1.0)
    expect(state!.position).toBe(0)
  })

  test('Test 8: clamps position to not exceed duration when currentTime >= end_sec', () => {
    const state = chapterPositionState(chapter, 750, 1.0)
    expect(state!.position).toBe(600) // duration = end_sec - start_sec = 600
  })

  test('Test 9: returns null when chapter is null', () => {
    const state = chapterPositionState(null, 400, 1.0)
    expect(state).toBeNull()
  })
})

// ── seektoAbsolute ────────────────────────────────────────────────────────────

describe('seektoAbsolute', () => {
  const chapter = { title: 'Chapter One', start_sec: 100, end_sec: 700 }

  test('Test 10: returns chapter.start_sec + seekTime (absolute time)', () => {
    expect(seektoAbsolute(chapter, 50)).toBe(150)
  })

  test('Test 11: returns null when chapter is null', () => {
    expect(seektoAbsolute(null, 50)).toBeNull()
  })
})
