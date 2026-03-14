export interface SubstackPost {
  title: string
  subtitle: string | null
  slug: string
  publishedAt: string
  bodyHtml: string
  excerpt: string    // first 200 chars of extracted plain text — used in curation prompt
  bodyText: string   // full extracted plain text, truncated to MAX_POST_WORDS
  audience: 'everyone' | 'paid'
  wordCount: number  // original word count from Substack API (pre-truncation)
}

export interface CuratedLesson {
  slug: string
  sequencePosition: number
  lessonFocus: string
  selectionRationale: string
}

export interface CuratedSelection {
  courseTitle: string
  courseDescription: string
  targetAudience: string
  overallRationale: string
  lessons: CuratedLesson[]  // ordered by sequencePosition
}

export interface GeneratedLesson {
  lessonNumber: number
  title: string
  subjectLine: string   // email subject line ≤50 chars
  previewText: string   // email preview text ≤90 chars
  markdownBody: string
  keyTakeaway: string
  filename: string      // e.g. "lesson-01-why-this-matters.md"
}

// API request/response shapes
export interface FetchPostsRequest {
  url: string
}

export interface FetchPostsResponse {
  posts: SubstackPost[]
  skippedCount: number  // paywalled posts skipped
}

export interface CurateRequest {
  posts: SubstackPost[]
}

export interface ExportRequest {
  lessons: GeneratedLesson[]
  courseTitle: string
  courseDescription: string
}

// SSE event shapes emitted by /api/curate
export type CurateSSEEvent =
  | { type: 'selection'; data: CuratedSelection }
  | { type: 'lesson_start'; lessonNumber: number }
  | { type: 'lesson_chunk'; lessonNumber: number; text: string }
  | { type: 'lesson_done'; lesson: GeneratedLesson }
  | { type: 'done'; lessons: GeneratedLesson[] }
  | { type: 'error'; message: string }
