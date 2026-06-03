import { bench, describe } from 'vitest'
import { extractTextFromHtml } from '../html-text'

// Perf signal for todo #163: extractTextFromHtml previously inserted a paragraph
// break per block element via cheerio `.after('\n\n')`, an O(n) DOM-mutation hot
// loop that dominated /api/fetch-posts CPU. The zero-mutation single-walk rewrite
// should be dramatically faster on list-heavy posts. These benchmarks document
// throughput; they do not gate CI (correctness lives in html-text.test.ts).
// Run with `npm run bench`.

function listHeavyFixture(items: number): string {
  const lis = Array.from({ length: items }, (_, i) => `<li>List item number ${i} with a few words.</li>`).join('')
  return `<html><body><h1>A cookbook</h1><ul>${lis}</ul></body></html>`
}

function typicalPostFixture(paragraphs: number): string {
  const sentence = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod.'
  const ps = Array.from({ length: paragraphs }, () => `<p>${sentence}</p>`).join('')
  return `<html><body><h1>A typical post</h1>${ps}</body></html>`
}

describe('extractTextFromHtml', () => {
  const listHeavy = listHeavyFixture(200)
  const typical = typicalPostFixture(50)

  bench('list-heavy post (200 list items)', () => {
    extractTextFromHtml(listHeavy)
  })

  bench('typical post (50 paragraphs)', () => {
    extractTextFromHtml(typical)
  })
})
