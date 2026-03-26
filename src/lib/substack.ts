import 'server-only'
import { load } from 'cheerio'
import type { SubstackPost } from '@/types'

export const MAX_POST_WORDS = 2500

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

export function normalizeSubstackUrl(raw: string): string {
  try {
    const url = new URL(raw.trim())
    if (!url.hostname.endsWith('.substack.com')) {
      throw new Error('URL must be a substack.com publication')
    }
    return url.hostname  // e.g. "example.substack.com"
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : `Invalid Substack URL: "${raw}"`)
  }
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms))
}

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; substack2eec/1.0)' },
    })
    if (res.status === 429) {
      const wait = Math.pow(2, attempt) * 5_000
      await sleep(wait)
      continue
    }
    return res
  }
  throw new Error(`Request failed after ${retries} retries: ${url}`)
}

// ---------------------------------------------------------------------------
// HTML extraction
// ---------------------------------------------------------------------------

export function extractTextFromHtml(html: string): string {
  const $ = load(html)

  $(
    [
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
  ).remove()

  // Preserve paragraph breaks before extracting
  $('p, h1, h2, h3, h4, li').after('\n\n')

  const text = $('body').text()
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()

  const words = text.split(/\s+/)
  if (words.length <= MAX_POST_WORDS) return text

  // Truncate to word ceiling then walk back to sentence boundary
  let candidate = words.slice(0, MAX_POST_WORDS).join(' ')
  const lastSentenceEnd = Math.max(
    candidate.lastIndexOf('. '),
    candidate.lastIndexOf('! '),
    candidate.lastIndexOf('? '),
  )
  if (lastSentenceEnd > 0) {
    candidate = candidate.slice(0, lastSentenceEnd + 1)
  }

  return candidate
}

// ---------------------------------------------------------------------------
// Substack API
// ---------------------------------------------------------------------------

interface SubstackArchiveStub {
  slug: string
  audience: string
}

interface SubstackFullPost {
  title: string
  subtitle: string | null
  slug: string
  post_date: string
  body_html: string
  word_count: number
  audience: string
}

async function fetchArchivePage(pub: string, limit: number, offset: number): Promise<SubstackArchiveStub[]> {
  const url = `https://${pub}/api/v1/archive?sort=new&limit=${limit}&offset=${offset}`
  const res = await fetchWithRetry(url)
  if (!res.ok) throw new Error(`Archive fetch failed: HTTP ${res.status}`)
  return res.json()
}

async function fetchFullPost(pub: string, slug: string): Promise<SubstackPost> {
  const url = `https://${pub}/api/v1/posts/${slug}`
  const res = await fetchWithRetry(url)
  if (!res.ok) throw new Error(`Post fetch failed: HTTP ${res.status} for slug "${slug}"`)
  const post: SubstackFullPost = await res.json()

  const bodyText = extractTextFromHtml(post.body_html)
  const excerpt = bodyText.slice(0, 200).replace(/\n/g, ' ').trim()

  return {
    title: post.title,
    subtitle: post.subtitle,
    slug: post.slug,
    publishedAt: post.post_date,
    bodyHtml: post.body_html,
    bodyText,
    excerpt,
    audience: post.audience as 'everyone' | 'paid',
    wordCount: post.word_count ?? 0,
  }
}

export interface FetchPublicPostsResult {
  posts: SubstackPost[]
  skippedCount: number
}

export async function fetchPublicPosts(
  pub: string,
  maxPosts = 50,
): Promise<FetchPublicPostsResult> {
  const PAGE_SIZE = 25
  const publicSlugs: string[] = []
  let skippedCount = 0
  let offset = 0

  // Paginate archive until we have enough public slugs or exhaust the archive
  while (publicSlugs.length < maxPosts) {
    const stubs = await fetchArchivePage(pub, PAGE_SIZE, offset)
    if (stubs.length === 0) break

    for (const stub of stubs) {
      if (stub.audience === 'everyone') {
        publicSlugs.push(stub.slug)
      } else {
        skippedCount++
      }
    }

    if (stubs.length < PAGE_SIZE) break  // last page
    offset += PAGE_SIZE
    await sleep(1_000)
  }

  const targets = publicSlugs.slice(0, maxPosts)
  const posts: SubstackPost[] = []

  for (const slug of targets) {
    await sleep(1_000)  // 1 req/sec for full post fetches
    const post = await fetchFullPost(pub, slug)
    posts.push(post)
  }

  return { posts, skippedCount }
}
