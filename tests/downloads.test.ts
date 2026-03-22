import { describe, expect, test } from 'bun:test'
const { formatBytes, reconcileDownloads } = require('../public/player-utils.js')

describe('formatBytes', () => {
  test('returns 0 MB for zero', () => {
    expect(formatBytes(0)).toBe('0 MB')
  })
  test('returns KB for values under 1MB', () => {
    expect(formatBytes(512000)).toBe('500 KB')
  })
  test('returns MB for megabyte values', () => {
    expect(formatBytes(1048576)).toBe('1 MB')
  })
  test('returns MB rounded for tens of MB', () => {
    expect(formatBytes(52428800)).toBe('50 MB')
  })
  test('returns GB with one decimal for gigabyte values', () => {
    expect(formatBytes(1073741824)).toBe('1.0 GB')
  })
  test('returns GB with decimal for fractional GB', () => {
    expect(formatBytes(2684354560)).toBe('2.5 GB')
  })
  test('returns 0 MB for null', () => {
    expect(formatBytes(null)).toBe('0 MB')
  })
  test('returns 0 MB for undefined', () => {
    expect(formatBytes(undefined)).toBe('0 MB')
  })
})

describe('reconcileDownloads', () => {
  test('keeps IDs that exist in cache', async () => {
    const cacheHas = (id: string) => ['1', '3'].includes(id)
    const deleted: string[] = []
    const result = await reconcileDownloads(['1', '2', '3'], cacheHas, (id: string) => deleted.push(id))
    expect(result).toEqual(['1', '3'])
    expect(deleted).toEqual(['2'])
  })
  test('returns empty for empty input', async () => {
    const result = await reconcileDownloads([], () => true, () => {})
    expect(result).toEqual([])
  })
  test('removes all if none in cache', async () => {
    const deleted: string[] = []
    const result = await reconcileDownloads(['1', '2'], () => false, (id: string) => deleted.push(id))
    expect(result).toEqual([])
    expect(deleted).toEqual(['1', '2'])
  })
})
