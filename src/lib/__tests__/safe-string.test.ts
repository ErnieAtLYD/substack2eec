import { describe, it, expect } from 'vitest'
import { safeSlice } from '../safe-string'

describe('safeSlice', () => {
  it('returns empty for empty input', () => {
    expect(safeSlice('', 5)).toBe('')
  })

  it('returns empty when max is 0', () => {
    expect(safeSlice('abc', 0)).toBe('')
  })

  it('throws RangeError on negative max', () => {
    expect(() => safeSlice('abc', -1)).toThrow(RangeError)
    expect(() => safeSlice('abc', -1)).toThrow(/max must be >= 0/)
  })

  it('returns the full string when max exceeds length', () => {
    expect(safeSlice('abc', 10)).toBe('abc')
  })

  it('returns the full string when max equals length', () => {
    expect(safeSlice('abc', 3)).toBe('abc')
  })

  it('plain ASCII cut at boundary', () => {
    expect(safeSlice('abcdef', 3)).toBe('abc')
  })

  it('drops a trailing high surrogate when cut lands on it', () => {
    // 'a' = 1 code unit, '😀' = 2 code units (D83D DE00), 'b' = 1
    // max=2: keep 'a' + first half of emoji — drop the high surrogate, result is just 'a'
    const result = safeSlice('a😀b', 2)
    expect(result).toBe('a')
    expect(result.length).toBe(1)
  })

  it('keeps the complete emoji when max=3 (low surrogate at boundary, not high)', () => {
    // 'a😀b' code units: a (0061), high (D83D), low (DE00), b (0062).
    // max=3 → charCodeAt(2) = low surrogate (not in [D800, DBFF]), so
    // the slice keeps a + high + low = 'a😀'. The pair is intact; no lone surrogate.
    const result = safeSlice('a😀b', 3)
    expect(result).toBe('a😀')
    expect(result.length).toBe(3)
    const lastUnit = result.charCodeAt(result.length - 1)
    expect(lastUnit < 0xD800 || lastUnit > 0xDBFF).toBe(true)
  })

  it('keeps a complete surrogate pair when max lands on the low surrogate', () => {
    // 'a😀b' length 4. max=4 returns full string.
    expect(safeSlice('a😀b', 4)).toBe('a😀b')
  })

  it('handles back-to-back emoji cut between pairs', () => {
    // '😀😀😀' = 6 code units. max=4 = two complete emoji.
    const result = safeSlice('😀😀😀', 4)
    expect(result).toBe('😀😀')
    expect(result.length).toBe(4)
  })

  it('drops the trailing high surrogate of an emoji cut mid-pair', () => {
    // max=3 = two and a half emoji → drop the half
    const result = safeSlice('😀😀😀', 3)
    expect(result).toBe('😀')
    expect(result.length).toBe(2)
  })

  it('preserves mid-string lone surrogates (does not sanitize what it did not break)', () => {
    // \uD800 is a lone high surrogate followed by 'b'. safeSlice should not
    // touch it because it appears mid-string, not at the truncation boundary.
    const input = 'a\uD800b'
    expect(safeSlice(input, 5)).toBe(input)
  })

  describe('invariants over varied inputs', () => {
    const fixtures: ReadonlyArray<readonly [string, string]> = [
      ['ascii', 'the quick brown fox jumps over the lazy dog'],
      ['emoji-heavy', '😀😁😂🤣😃😄😅😆😉😊'],
      ['cjk', '今日はいい天気ですね。明日も晴れるといいな。'],
      ['mixed', 'a😀b漢字\uD800lone-surrogate'],
      ['repeating-pair', '😀'.repeat(50)],
    ]

    for (const [label, s] of fixtures) {
      for (const max of [0, 1, 2, 3, 5, 10, 25, 100]) {
        it(`${label}, max=${max}: length ≤ max and no trailing high surrogate`, () => {
          const out = safeSlice(s, max)
          expect(out.length).toBeLessThanOrEqual(max)
          if (out.length > 0) {
            const last = out.charCodeAt(out.length - 1)
            expect(last < 0xD800 || last > 0xDBFF).toBe(true)
          }
        })
      }
    }
  })
})
