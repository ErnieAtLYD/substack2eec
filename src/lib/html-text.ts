import { load } from 'cheerio'

export const MAX_POST_WORDS = 2500

const NOISE_SELECTORS = [
  '.subscription-widget',
  '.share-widget',
  '.subscribe-widget',
  '.button-wrapper',
  '.captioned-button-wrap',
  '.tweet',
  'footer',
  'figure',
  '.footnote',
  'script',
  'style',
].join(', ')

export interface ExtractTextOptions {
  truncationMarker?: string
}

export function extractTextFromHtml(html: string, options: ExtractTextOptions = {}): string {
  const $ = load(html)

  $(NOISE_SELECTORS).remove()

  $('p, h1, h2, h3, h4, li').after('\n\n')

  const text = $('body').text()
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()

  return truncateTextToWords(text, MAX_POST_WORDS, options.truncationMarker)
}

// Truncates by walking the original string's word boundaries, preserving any
// existing whitespace (notably \n\n paragraph breaks) within the kept slice.
export function truncateTextToWords(
  text: string,
  maxWords: number,
  truncationMarker = '',
): string {
  const wordRe = /\S+/g
  let count = 0
  let cutIndex = -1
  let m: RegExpExecArray | null
  while ((m = wordRe.exec(text)) !== null) {
    count++
    if (count > maxWords) {
      cutIndex = m.index
      break
    }
  }
  if (cutIndex === -1) return text

  let candidate = text.slice(0, cutIndex).trimEnd()
  const lastSentenceEnd = Math.max(
    candidate.lastIndexOf('. '),
    candidate.lastIndexOf('! '),
    candidate.lastIndexOf('? '),
  )
  if (lastSentenceEnd > 0) {
    candidate = candidate.slice(0, lastSentenceEnd + 1)
  }

  return candidate + truncationMarker
}
