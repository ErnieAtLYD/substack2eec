import { z } from 'zod'

export interface SubstackPost {
  title: string
  subtitle: string | null
  slug: string
  publishedAt: string
  // Optional: present on /api/fetch-posts output, stripped by SubstackPostInputSchema
  // on /api/curate and /api/propose-courses so it doesn't traverse those wires.
  bodyHtml?: string
  excerpt: string    // first 200 chars of extracted plain text — used in curation prompt
  bodyText: string   // full extracted plain text, truncated to MAX_POST_WORDS
  audience: 'everyone' | 'paid'
  wordCount: number  // original word count from Substack API (pre-truncation)
}

const CuratedLessonSchema = z.object({
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

// Common fields validated identically across all route inputs and the
// fetch-posts output. bodyHtml lives only on the full schema below — it
// reaches /api/fetch-posts' response but is dead weight on the curate/propose
// wire, where each post can be 500KB of attacker-controllable input.
const SubstackPostBaseSchema = z.object({
  title: z.string().max(500),
  subtitle: z.string().max(500).nullable(),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).max(100),
  publishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  excerpt: z.string().max(500),
  bodyText: z.string().max(100_000),
  audience: z.enum(['everyone', 'paid']),
  wordCount: z.number().int().min(0).max(100_000),
})

// Input schema for /api/curate and /api/propose-courses. Extra fields like
// bodyHtml from the UI get stripped by Zod, so the attacker-controllable
// surface in these routes is bounded by the fields above, not 25 MB.
export const SubstackPostInputSchema = SubstackPostBaseSchema

// Full schema — what /api/fetch-posts returns. bodyHtml stays for the UI
// preview path and any future renderers.
export const SubstackPostSchema = SubstackPostBaseSchema.extend({
  bodyHtml: z.string().max(500_000),
})

export type CuratedLesson = z.infer<typeof CuratedLessonSchema>
export type CuratedSelection = z.infer<typeof CuratedSelectionSchema>

export const GeneratedLessonSchema = z.object({
  lessonNumber: z.number(),
  title: z.string().max(500),
  subjectLine: z.string().max(50),
  previewText: z.string().max(90),
  markdownBody: z.string().max(50_000),
  keyTakeaway: z.string().max(500),
  // stem must start and end with alphanumeric and contain no consecutive hyphens.
  // `-(?!-)` matches a single hyphen not followed by another hyphen.
  filename: z.string().regex(/^[a-z0-9]([a-z0-9]|-(?!-))*[a-z0-9]\.md$/).max(80),
})
export type GeneratedLesson = z.infer<typeof GeneratedLessonSchema>

// API request/response shapes
export interface FetchPostsRequest {
  url: string
}

export interface FetchPostsResponse {
  posts: SubstackPost[]
  skippedCount: number  // paywalled posts skipped
}

const ALLOWED_LESSON_COUNTS = [3, 5, 7, 10] as const
export type LessonCount = typeof ALLOWED_LESSON_COUNTS[number]

export function isLessonCount(value: unknown): value is LessonCount {
  return (ALLOWED_LESSON_COUNTS as ReadonlyArray<unknown>).includes(value)
}

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
  courseTitle?: string
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
