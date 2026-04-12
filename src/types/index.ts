import { z } from 'zod'

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

export const CuratedLessonSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).max(100),
  sequencePosition: z.number().int().min(1).max(10),
  lessonFocus: z.string().max(300),
  selectionRationale: z.string().max(300),
})

export const CuratedSelectionSchema = z.object({
  courseTitle: z.string().max(60),
  courseDescription: z.string().max(500),
  targetAudience: z.string().max(200),
  overallRationale: z.string().max(500),
  lessons: z.array(CuratedLessonSchema).min(1).max(10),
})

export const SubstackPostSchema = z.object({
  title: z.string().max(500),
  subtitle: z.string().max(500).nullable(),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).max(100),
  publishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  bodyHtml: z.string().max(500_000),
  excerpt: z.string().max(500),
  bodyText: z.string(),
  audience: z.enum(['everyone', 'paid']),
  wordCount: z.number().int().min(0).max(100_000),
})

export type CuratedLesson = z.infer<typeof CuratedLessonSchema>
export type CuratedSelection = z.infer<typeof CuratedSelectionSchema>

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

export const ALLOWED_LESSON_COUNTS = [3, 5, 7, 10] as const
export type LessonCount = typeof ALLOWED_LESSON_COUNTS[number]

export function isLessonCount(value: unknown): value is LessonCount {
  return (ALLOWED_LESSON_COUNTS as ReadonlyArray<unknown>).includes(value)
}

export const MAX_BODY_CHARS = 15_000

export interface CurateRequest {
  posts: SubstackPost[]
  lessonCount?: number  // optional; validated server-side, defaults to 5
  selectedCourse?: CuratedSelection  // if provided, skips AI curation step
}

export interface ProposeCoursesResponse {
  candidates: CuratedSelection[]
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
