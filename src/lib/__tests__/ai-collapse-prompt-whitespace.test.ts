import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { collapsePromptWhitespace } = await import('../ai')
const { MAX_PROMPT_FIELD_LEN } = await import('../limits')

describe('collapsePromptWhitespace', () => {
  it('throws RangeError when input exceeds MAX_PROMPT_FIELD_LEN', () => {
    expect(() => collapsePromptWhitespace('x'.repeat(MAX_PROMPT_FIELD_LEN + 1)))
      .toThrow(RangeError)
    expect(() => collapsePromptWhitespace('x'.repeat(MAX_PROMPT_FIELD_LEN + 1)))
      .toThrow(/trust-boundary violation/)
  })

  it('does not throw at exactly MAX_PROMPT_FIELD_LEN', () => {
    expect(() => collapsePromptWhitespace('x'.repeat(MAX_PROMPT_FIELD_LEN)))
      .not.toThrow()
  })

  it('collapses tab + CR + LF to single space', () => {
    expect(collapsePromptWhitespace('a\t\r\nb')).toBe('a b')
  })

  it('collapses runs of mixed whitespace to single space', () => {
    expect(collapsePromptWhitespace('a   \n\n\t   b')).toBe('a b')
  })

  it('collapses NBSP (U+00A0) to single space', () => {
    expect(collapsePromptWhitespace('a  b')).toBe('a b')
  })

  it('collapses U+2028 (line separator) and U+2029 (paragraph separator)', () => {
    expect(collapsePromptWhitespace('a b c')).toBe('a b c')
  })

  it('strips zero-width chars (U+200B)', () => {
    expect(collapsePromptWhitespace('a​b')).toBe('ab')
  })

  it('strips zero-width-joiner / non-joiner (U+200C, U+200D)', () => {
    expect(collapsePromptWhitespace('a‌b‍c')).toBe('abc')
  })

  it('strips LRM/RLM marks (U+200E, U+200F)', () => {
    expect(collapsePromptWhitespace('a‎b‏c')).toBe('abc')
  })

  it('strips bidi-override chars (U+202A-U+202E)', () => {
    expect(collapsePromptWhitespace('a‪b‮c')).toBe('abc')
  })

  it('strips bidi isolate chars (U+2066-U+2069)', () => {
    expect(collapsePromptWhitespace('a⁦b⁩c')).toBe('abc')
  })

  it('strips BOM / ZWNBSP (U+FEFF)', () => {
    expect(collapsePromptWhitespace('﻿hello﻿')).toBe('hello')
  })

  it('trims leading and trailing whitespace', () => {
    expect(collapsePromptWhitespace('   hello   ')).toBe('hello')
  })

  it('returns empty string unchanged', () => {
    expect(collapsePromptWhitespace('')).toBe('')
  })

  it('does not insert a double space when stripping ZW between words', () => {
    // "x" SP "y" ZW "z" → strip ZW first → "x y z" → collapse → "x y z"
    expect(collapsePromptWhitespace('x y​z')).toBe('x yz')
  })
})
