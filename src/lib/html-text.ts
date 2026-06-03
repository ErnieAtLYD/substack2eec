import { load } from 'cheerio'
import { MAX_POST_WORDS } from '@/lib/limits'

// Re-export for back-compat with existing imports.
export { MAX_POST_WORDS }

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

// Block elements after which a paragraph break is emitted, mirroring the prior
// `$('p, h1, h2, h3, h4, li').after('\n\n')` selector exactly.
const BLOCK_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'li'])

// Minimal structural view of the domhandler nodes cheerio produces. We only read
// these fields, so typing them locally avoids depending on domhandler's export
// surface (a transitive dep) and keeps the walk resilient across cheerio versions.
interface DomNode {
  type: string
  name?: string
  data?: string
  children?: DomNode[]
}

// Single depth-first walk that concatenates all text (matching `.text()`) and
// appends '\n\n' after each block element (matching the old per-element mutation),
// with zero DOM mutation and no HTML reparse. The break is emitted post-order so
// it lands after the element's full subtree text — identical to inserting a
// following sibling. See todo #163.
function collectText(node: DomNode, out: string[]): void {
  if (node.type === 'text') {
    if (node.data) out.push(node.data)
    return
  }
  if (node.children) {
    for (const child of node.children) collectText(child, out)
  }
  if (node.name && BLOCK_TAGS.has(node.name)) out.push('\n\n')
}

export function extractTextFromHtml(html: string, options: ExtractTextOptions = {}): string {
  const $ = load(html)

  $(NOISE_SELECTORS).remove()

  const body = $('body')[0] as unknown as DomNode | undefined
  const parts: string[] = []
  if (body) collectText(body, parts)

  const text = parts.join('')
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
