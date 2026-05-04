import { describe, it, expect } from 'vitest'
import { extractTextFromHtml, truncateTextToWords, MAX_POST_WORDS } from '../html-text'

describe('extractTextFromHtml', () => {
  it('returns plain text for a short post unchanged', () => {
    const html = '<html><body><p>Hello world.</p></body></html>'
    expect(extractTextFromHtml(html)).toBe('Hello world.')
  })

  it('inserts paragraph breaks between block elements', () => {
    const html = '<html><body><p>One.</p><p>Two.</p><p>Three.</p></body></html>'
    expect(extractTextFromHtml(html)).toBe('One.\n\nTwo.\n\nThree.')
  })

  it('removes noise selectors (subscribe widgets, figures, footers)', () => {
    const html = `
      <html><body>
        <p>Real content.</p>
        <div class="subscribe-widget">SUBSCRIBE NOW</div>
        <figure><img src="x" alt="boom"><figcaption>caption</figcaption></figure>
        <footer>Disclaimer footer</footer>
        <div class="tweet">tweet embed</div>
      </body></html>
    `
    const out = extractTextFromHtml(html)
    expect(out).toContain('Real content.')
    expect(out).not.toContain('SUBSCRIBE')
    expect(out).not.toContain('caption')
    expect(out).not.toContain('Disclaimer')
    expect(out).not.toContain('tweet')
  })

  it('returns empty string for empty HTML', () => {
    expect(extractTextFromHtml('')).toBe('')
  })

  it('does not append truncation marker when text is below the cap', () => {
    const html = '<p>short text</p>'
    expect(extractTextFromHtml(html, { truncationMarker: '\n\n[truncated]' })).toBe('short text')
  })

  it('preserves paragraph breaks across the truncation boundary', () => {
    const sentence = 'Lorem ipsum dolor sit amet consectetur adipiscing elit. '  // 8 words
    // 400 paragraphs × 8 words = 3200 words, well over MAX_POST_WORDS (2500)
    const paragraphs = Array.from({ length: 400 }, () => `<p>${sentence.trim()}</p>`).join('')
    const html = `<html><body>${paragraphs}</body></html>`

    const out = extractTextFromHtml(html, { truncationMarker: '\n\n[truncated]' })

    expect(out).toContain('\n\n')                    // paragraph breaks survived truncation
    expect(out.endsWith('\n\n[truncated]')).toBe(true)
    expect(out.split(/\s+/).length).toBeLessThanOrEqual(MAX_POST_WORDS + 5) // marker adds 1 word
  })
})

describe('truncateTextToWords', () => {
  it('returns the input unchanged when under the cap', () => {
    expect(truncateTextToWords('one two three.', 5)).toBe('one two three.')
  })

  it('returns the input unchanged when exactly at the cap', () => {
    expect(truncateTextToWords('one two three', 3)).toBe('one two three')
  })

  it('truncates at the last sentence boundary inside the kept slice', () => {
    const text = 'First sentence. Second sentence. Third sentence. Fourth sentence.'
    // 8 words; cap=6 cuts before "Fourth", then walkback to last ". " keeps
    // through "Second sentence." (the final ". " in the slice).
    const out = truncateTextToWords(text, 6)
    expect(out).toBe('First sentence. Second sentence.')
  })

  it('falls back to raw word slice when no sentence boundary is found', () => {
    const text = 'one two three four five six seven'
    expect(truncateTextToWords(text, 4)).toBe('one two three four')
  })

  it('appends the truncation marker only when truncation occurs', () => {
    expect(truncateTextToWords('short', 100, '[CUT]')).toBe('short')
    expect(truncateTextToWords('one two three four five', 3, '[CUT]')).toBe('one two three[CUT]')
  })

  it('preserves \\n\\n paragraph breaks within the kept slice', () => {
    const text = 'Para one.\n\nPara two has more words.\n\nPara three.'
    // 9 words, cap to 6 → keeps "Para one.\n\nPara two has more"
    const out = truncateTextToWords(text, 6)
    expect(out).toContain('\n\n')
  })

  it('handles empty input', () => {
    expect(truncateTextToWords('', 100)).toBe('')
  })
})
