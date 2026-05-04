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

  const words = text.split(/\s+/)
  if (words.length <= MAX_POST_WORDS) return text

  let candidate = words.slice(0, MAX_POST_WORDS).join(' ')
  const lastSentenceEnd = Math.max(
    candidate.lastIndexOf('. '),
    candidate.lastIndexOf('! '),
    candidate.lastIndexOf('? '),
  )
  if (lastSentenceEnd > 0) {
    candidate = candidate.slice(0, lastSentenceEnd + 1)
  }

  return candidate + (options.truncationMarker ?? '')
}
