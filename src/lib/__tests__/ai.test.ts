import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@anthropic-ai/sdk', () => ({ default: vi.fn() }))
vi.mock('@/env', () => ({ getEnv: vi.fn(() => ({ ANTHROPIC_API_KEY: 'test' })) }))

import { sanitizeForPrompt } from '../ai'

describe('sanitizeForPrompt', () => {
  it('returns a normal string unchanged', () => {
    expect(sanitizeForPrompt('hello world')).toBe('hello world')
  })

  it('replaces newlines, carriage returns, and tabs with spaces', () => {
    expect(sanitizeForPrompt('line1\nline2\rline3\ttab')).toBe('line1 line2 line3 tab')
  })

  it('replaces multiple consecutive whitespace characters with individual spaces', () => {
    expect(sanitizeForPrompt('a\n\n\nb')).toBe('a   b')
  })

  it('does not replace regular spaces', () => {
    expect(sanitizeForPrompt('a b  c')).toBe('a b  c')
  })

  it('truncates strings longer than 300 characters', () => {
    const longString = 'a'.repeat(310)
    const result = sanitizeForPrompt(longString)
    expect(result).toHaveLength(300)
    expect(result).toBe('a'.repeat(300))
  })

  it('handles empty strings', () => {
    expect(sanitizeForPrompt('')).toBe('')
  })

  it('truncates before replacing whitespace', () => {
    // Current implementation: s.slice(0, 300).replace(/[\n\r\t]/g, ' ')
    const stringWithNewlineAt301 = 'a'.repeat(300) + '\n' + 'b'
    expect(sanitizeForPrompt(stringWithNewlineAt301)).toBe('a'.repeat(300))
  })

  it('replaces whitespace within the truncated limit', () => {
    const stringWithNewlineAt299 = 'a'.repeat(299) + '\n' + 'b'
    const result = sanitizeForPrompt(stringWithNewlineAt299)
    expect(result).toBe('a'.repeat(299) + ' ')
    expect(result).toHaveLength(300)
  })

  it('handles strings exactly 300 characters long', () => {
    const exactString = 'a'.repeat(300)
    expect(sanitizeForPrompt(exactString)).toBe(exactString)
  })

  it('does not split surrogate pairs at the truncation boundary', () => {
    // 💩 is \uD83D\uDCA9 (two 16-bit code units)
    // If we slice at 300, it should be preserved if it's the 300th character.
    // [...s].slice(0, 300) should treat 💩 as a single character.
    const longString = 'a'.repeat(299) + '💩'
    const result = sanitizeForPrompt(longString)
    expect(result).toBe('a'.repeat(299) + '💩')
    expect(result).toHaveLength(301) // 299 'a's + 2 bytes for '💩' (string length)

    const longString2 = 'a'.repeat(300) + '💩'
    const result2 = sanitizeForPrompt(longString2)
    expect(result2).toBe('a'.repeat(300))
    expect(result2).toHaveLength(300)
  })
})
