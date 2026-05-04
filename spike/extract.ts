/**
 * Spike: test extractTextFromHtml against real Substack posts.
 *
 * Usage:
 *   npx tsx spike/extract.ts <substack-base-url> [limit]
 *
 * Example:
 *   npx tsx spike/extract.ts https://simonwillison.substack.com 3
 */

import { extractTextFromHtml } from '../src/lib/html-text'

const TRUNCATION_MARKER = '\n\n[truncated]'

// ---------------------------------------------------------------------------
// Substack API helpers
// ---------------------------------------------------------------------------

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; spike/1.0)' },
    })
    if (res.status === 429) {
      const wait = Math.pow(2, attempt) * 5_000
      console.warn(`  429 — waiting ${wait / 1000}s before retry`)
      await new Promise(r => setTimeout(r, wait))
      continue
    }
    return res
  }
  throw new Error(`Failed after ${retries} retries: ${url}`)
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

function normalizeSubstackUrl(raw: string): string {
  const url = new URL(raw)
  return url.hostname  // e.g. "simonwillison.substack.com"
}

async function fetchPostSlugs(pub: string, limit: number): Promise<string[]> {
  const url = `https://${pub}/api/v1/archive?sort=new&limit=${limit}&offset=0`
  const res = await fetchWithRetry(url)
  if (!res.ok) throw new Error(`Archive fetch failed: ${res.status}`)
  const posts = await res.json() as Array<{ slug: string; audience: string }>
  return posts
    .filter(p => p.audience === 'everyone')
    .map(p => p.slug)
}

async function fetchFullPost(pub: string, slug: string) {
  const url = `https://${pub}/api/v1/posts/${slug}`
  const res = await fetchWithRetry(url)
  if (!res.ok) throw new Error(`Post fetch failed: ${res.status} for ${slug}`)
  const post = await res.json() as {
    title: string
    slug: string
    body_html: string
    word_count: number   // present on full post, not on archive stub
    audience: string
  }
  return post
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const rawUrl = process.argv[2]
  const limit = parseInt(process.argv[3] ?? '3', 10)

  if (!rawUrl) {
    console.error('Usage: npx tsx spike/extract.ts <substack-url> [limit]')
    process.exit(1)
  }

  const pub = normalizeSubstackUrl(rawUrl)
  console.log(`\nFetching up to ${limit} public posts from: ${pub}\n`)

  const slugs = await fetchPostSlugs(pub, limit + 5)  // fetch a few extra to account for paywalled
  const targets = slugs.slice(0, limit)

  for (const slug of targets) {
    await sleep(1_000)  // 1 req/sec
    const post = await fetchFullPost(pub, slug)

    const extracted = extractTextFromHtml(post.body_html, { truncationMarker: TRUNCATION_MARKER })
    const wordCount = extracted.split(/\s+/).length
    const wasTruncated = extracted.endsWith(TRUNCATION_MARKER)

    console.log('─'.repeat(72))
    console.log(`TITLE:     ${post.title}`)
    console.log(`SLUG:      ${post.slug}`)
    console.log(`API words: ${post.word_count}`)
    console.log(`Extracted: ${wordCount} words${wasTruncated ? ` (truncated from ${post.word_count})` : ''}`)
    console.log()
    console.log('--- FIRST 400 CHARS ---')
    console.log(extracted.slice(0, 400))
    console.log()
    console.log('--- LAST 200 CHARS ---')
    console.log(extracted.slice(-200))
    console.log()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
