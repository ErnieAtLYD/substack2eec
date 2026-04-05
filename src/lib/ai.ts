import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { getEnv } from '@/env'
import type { SubstackPost, CuratedSelection, GeneratedLesson, CuratedLesson } from '@/types'

let _client: Anthropic | null = null
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: getEnv().ANTHROPIC_API_KEY })
  return _client
}

const MODEL = 'claude-sonnet-4-6'

const MAX_PROMPT_FIELD_LEN = 300

// Escapes XML element content. NOT safe for XML attribute values (does not escape quotes).
// If embedding in an attribute value context, also escape " and '.
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ---------------------------------------------------------------------------
// Curation (Step 1) — tool use for guaranteed structured output
// ---------------------------------------------------------------------------

function buildCurationTool(lessonCount: number): Anthropic.Messages.Tool {
  return {
    name: 'select_course_posts',
    description: 'Select and sequence Substack posts that together form the best Educational Email Course.',
    input_schema: {
      type: 'object',
      properties: {
        courseTitle: { type: 'string', description: 'Compelling course title, ≤60 chars' },
        courseDescription: { type: 'string', description: '2–3 sentences: what the reader will learn and why it matters' },
        targetAudience: { type: 'string', description: 'Who this course is for, 1 sentence' },
        overallRationale: { type: 'string', description: 'Why these posts together form a coherent course' },
        lessons: {
          type: 'array',
          minItems: 1,
          maxItems: lessonCount,
          items: {
            type: 'object',
            required: ['slug', 'sequencePosition', 'lessonFocus', 'selectionRationale'],
            properties: {
              slug: { type: 'string' },
              sequencePosition: { type: 'integer', minimum: 1, maximum: lessonCount },
              lessonFocus: { type: 'string', description: 'The specific angle or insight to emphasize in this lesson' },
              selectionRationale: { type: 'string', description: 'Why this post was chosen and how it serves the course arc' },
            },
          },
        },
      },
      required: ['courseTitle', 'courseDescription', 'targetAudience', 'overallRationale', 'lessons'],
    },
  }
}

const CURATION_SYSTEM = `\
You are an expert instructional designer specializing in email courses.
Your job is to review a Substack newsletter archive and select posts that \
together form the best possible Educational Email Course (EEC).

An EEC is a sequence of short, actionable emails that teach a reader \
one coherent topic — delivered one lesson at a time.

## What makes a great EEC

- Has a single teachable throughline the reader can master by the final lesson
- Progresses logically — each lesson builds on the last (scaffolded learning)
- Starts with motivation ("why this matters") and ends with mastery or a \
  concrete next step
- Avoids time-sensitive content, news, product announcements, or posts that \
  feel stale outside their original context
- Avoids redundancy — each selected post contributes something distinct
- Favors posts with enough substance to fill a 3–5 minute read`

// Sanitizes user-controlled strings for plain-text prompt context: collapses whitespace
// and caps length. For XML block context, also apply xmlEscape after this call.
export function sanitizeForPrompt(s: string): string {
  return s.slice(0, MAX_PROMPT_FIELD_LEN).replace(/[\n\r\t]/g, ' ')
}

function formatPostsForCuration(posts: Pick<SubstackPost, 'slug' | 'title' | 'subtitle' | 'publishedAt' | 'wordCount' | 'excerpt'>[]): string {
  return posts.map((p, i) =>
    [
      `[${i + 1}] slug: ${p.slug}`,
      `    title: ${sanitizeForPrompt(p.title)}`,
      p.subtitle ? `    subtitle: ${sanitizeForPrompt(p.subtitle)}` : null,
      `    published: ${sanitizeForPrompt(p.publishedAt).slice(0, 10)}`,
      `    words: ${p.wordCount}`,
      `    excerpt: ${sanitizeForPrompt(p.excerpt)}`,
    ].filter(Boolean).join('\n')
  ).join('\n\n')
}

export async function curatePostSelection(posts: SubstackPost[], lessonCount: number): Promise<CuratedSelection> {
  const prompt = `\
Below are ${posts.length} posts from a Substack newsletter archive.

${formatPostsForCuration(posts)}

---

Select exactly ${lessonCount} posts (or fewer if the archive has fewer than ${lessonCount} suitable posts) \
that together form the best EEC. The lessons array must be ordered by sequencePosition \
(1 = first email sent).`

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: [{ type: 'text' as const, text: CURATION_SYSTEM, cache_control: { type: 'ephemeral' } as any }],
    tools: [buildCurationTool(lessonCount)],
    tool_choice: { type: 'tool', name: 'select_course_posts' },
    messages: [{ role: 'user', content: prompt }],
  })

  if (response.stop_reason === 'max_tokens') {
    throw new Error('Curation response was truncated (max_tokens). Try with fewer posts.')
  }

  const toolBlock = response.content.find(b => b.type === 'tool_use')
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    throw new Error('Claude did not return a tool call for curation')
  }

  const raw = toolBlock.input as Record<string, unknown>

  if (!Array.isArray(raw.lessons)) {
    console.error('[curate] tool call failed. Raw response:', JSON.stringify(raw).slice(0, 300))
    throw new Error('Curation response was incomplete or invalid. Please try again.')
  }

  const lessons = (raw.lessons as unknown[])
    .filter((l): l is CuratedLesson =>
      typeof l === 'object' && l !== null &&
      typeof (l as Record<string, unknown>).sequencePosition === 'number' &&
      !Number.isNaN((l as Record<string, unknown>).sequencePosition) &&
      typeof (l as Record<string, unknown>).slug === 'string'
    )
    .sort((a, b) => a.sequencePosition - b.sequencePosition)

  return {
    courseTitle: String(raw.courseTitle ?? ''),
    courseDescription: String(raw.courseDescription ?? ''),
    targetAudience: String(raw.targetAudience ?? ''),
    overallRationale: String(raw.overallRationale ?? ''),
    lessons,
  }
}

// ---------------------------------------------------------------------------
// Candidate proposal — one call, 3 distinct CuratedSelections
// ---------------------------------------------------------------------------

function buildProposeCandidatesTool(lessonCount: number): Anthropic.Messages.Tool {
  return {
    name: 'propose_course_candidates',
    description: 'Propose 3 distinctly different Educational Email Course themes from the same newsletter archive.',
    input_schema: {
      type: 'object',
      required: ['candidates'],
      properties: {
        candidates: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: {
            type: 'object' as const,
            required: ['courseTitle', 'courseDescription', 'targetAudience', 'overallRationale', 'lessons'],
            properties: {
              courseTitle: { type: 'string', description: 'Compelling course title, ≤60 chars' },
              courseDescription: { type: 'string', description: '2–3 sentences: what the reader will learn and why it matters' },
              targetAudience: { type: 'string', description: 'Who this course is for, 1 sentence' },
              overallRationale: { type: 'string', description: 'Why these posts together form a coherent course' },
              lessons: {
                type: 'array' as const,
                minItems: 1,
                maxItems: lessonCount,
                items: {
                  type: 'object' as const,
                  required: ['slug', 'sequencePosition', 'lessonFocus', 'selectionRationale'],
                  properties: {
                    slug: { type: 'string' },
                    sequencePosition: { type: 'integer', minimum: 1, maximum: lessonCount },
                    lessonFocus: { type: 'string', description: 'The specific angle or insight to emphasize in this lesson' },
                    selectionRationale: { type: 'string', description: 'Why this post was chosen and how it serves the course arc' },
                  },
                },
              },
            },
          },
        },
      },
    },
  }
}

// Note: PROPOSE_SYSTEM extends CURATION_SYSTEM via interpolation.
// Edits to CURATION_SYSTEM will affect both curation and candidate proposal.
const PROPOSE_SYSTEM = `\
${CURATION_SYSTEM}

## Additional requirement for this task

You must propose EXACTLY 3 course candidates that are as different from each other as possible:
- Each candidate must emphasize a distinct theme from the newsletter
- Each candidate should draw on mostly different posts (minimal overlap between candidates)
- Together, the 3 candidates should cover the breadth of the newsletter's topics
- A reader should be able to see at a glance why each candidate is a different kind of course`

export async function proposeCourseCandidates(
  posts: Pick<SubstackPost, 'slug' | 'title' | 'subtitle' | 'publishedAt' | 'wordCount' | 'excerpt' | 'audience'>[],
  lessonCount: number,
): Promise<CuratedSelection[]> {
  const prompt = `\
Below are ${posts.length} posts from a Substack newsletter archive.

${formatPostsForCuration(posts)}

---

Propose exactly 3 distinctly different course themes. For each, select exactly \
${lessonCount} posts (or fewer if the archive doesn't have enough suitable posts) \
ordered by sequencePosition (1 = first email sent).

The 3 candidates must be thematically distinct — different topics, different angles, \
different audiences if possible. Minimal post overlap between candidates.`

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: [{ type: 'text' as const, text: PROPOSE_SYSTEM, cache_control: { type: 'ephemeral' } as any }],
    tools: [buildProposeCandidatesTool(lessonCount)],
    tool_choice: { type: 'tool', name: 'propose_course_candidates' },
    messages: [{ role: 'user', content: prompt }],
  })

  if (response.stop_reason === 'max_tokens') {
    throw new Error('Candidate proposal was truncated (max_tokens). Try with fewer posts.')
  }

  const toolBlock = response.content.find(b => b.type === 'tool_use')
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    throw new Error('Claude did not return a tool call for candidate proposal')
  }

  const raw = toolBlock.input as Record<string, unknown>

  if (!Array.isArray(raw.candidates)) {
    console.error('[propose] tool call failed. Raw response:', JSON.stringify(raw).slice(0, 300))
    throw new Error('Candidate proposal response was incomplete or invalid. Please try again.')
  }

  const candidates = (raw.candidates as Record<string, unknown>[])
    .filter(c => Array.isArray(c.lessons) && typeof c.courseTitle === 'string')
    .map(c => ({
      courseTitle: String(c.courseTitle ?? ''),
      courseDescription: String(c.courseDescription ?? ''),
      targetAudience: String(c.targetAudience ?? ''),
      overallRationale: String(c.overallRationale ?? ''),
      lessons: (c.lessons as unknown[])
        .filter((l): l is CuratedLesson =>
          typeof l === 'object' && l !== null &&
          typeof (l as Record<string, unknown>).sequencePosition === 'number' &&
          !Number.isNaN((l as Record<string, unknown>).sequencePosition) &&
          typeof (l as Record<string, unknown>).slug === 'string'
        )
        .sort((a, b) => a.sequencePosition - b.sequencePosition),
    }))

  if (candidates.length < 3) {
    throw new Error(`Expected 3 course candidates, got ${candidates.length}. Please try again.`)
  }

  return candidates
}

// ---------------------------------------------------------------------------
// Rewriting (Step 2) — streaming with prompt caching
// ---------------------------------------------------------------------------

const LESSON_SCHEMA = `\
## Lesson {N}: {Title}

**Subject line:** {email subject, ≤50 chars}
**Preview text:** {preview snippet, ≤90 chars}

---

### The Core Idea

[2–3 paragraphs. Conversational, no jargon without definition.]

### Why This Matters

[1–2 paragraphs grounding in a real use case or consequence.]

### How To Apply It

[3–5 numbered steps or short code block if technical.]

### The Mistake Everyone Makes

[1 paragraph: the most common error and how to sidestep it.]

---

**Key takeaway:** [one bold sentence]

**Next lesson:** [one-sentence teaser for the next lesson, or omit on the final lesson]`

function buildRewriteSystem(): string {
  return `\
You are an expert email course writer. Your job is to rewrite Substack newsletter \
posts as tight, actionable email lessons.

## Lesson structure

Use EXACTLY this structure — do not add or remove sections:

${LESSON_SCHEMA}

## Style rules

- Conversational tone, not academic
- No jargon without immediate definition
- Each lesson: 400–600 words in the markdown body
- Do not mention the original Substack post or that this is a rewrite
- Start your response directly with "## Lesson" — no preamble`
}

function buildCourseContextBlock(
  selection: CuratedSelection,
  priorLessons: GeneratedLesson[],
): string {
  const prior = priorLessons.length > 0
    ? priorLessons.map(l => `  Lesson ${l.lessonNumber}: ${xmlEscape(l.title)} — ${xmlEscape(l.keyTakeaway)}`).join('\n')
    : '  (none yet)'

  return `<course>
<title>${xmlEscape(selection.courseTitle)}</title>
<description>${xmlEscape(selection.courseDescription)}</description>
<audience>${xmlEscape(selection.targetAudience)}</audience>
<arc>${xmlEscape(selection.overallRationale)}</arc>
<prior_lessons>
${prior}
</prior_lessons>
</course>`
}

function positionHint(lessonNum: number, total: number): string {
  if (lessonNum === 1) return 'opening — establish the problem and why it matters to the reader'
  if (lessonNum === total) return 'closing — synthesize everything and give the reader a concrete next step'
  return 'middle — build on what came before and set up the next lesson'
}

export async function* rewriteAsLesson(
  post: SubstackPost,
  lessonNum: number,
  total: number,
  selection: CuratedSelection,
  priorLessons: GeneratedLesson[],
): AsyncGenerator<string> {
  const curatedLesson = selection.lessons.find(l => l.slug === post.slug)
  const focus = curatedLesson?.lessonFocus ?? `Key insights from "${post.title}"`

  const courseContextText = buildCourseContextBlock(selection, priorLessons)

  const lessonInstructions = `\
<source_material>
${xmlEscape(post.bodyText)}
</source_material>

<lesson>
  <number>${lessonNum}</number>
  <focus>${xmlEscape(focus)}</focus>
  <position>${positionHint(lessonNum, total)}</position>
</lesson>

Write Lesson ${lessonNum} of ${total} now. Start directly with "## Lesson ${lessonNum}:".`

  const stream = getClient().messages.stream({
    model: MODEL,
    max_tokens: 2048,
    system: buildRewriteSystem(),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: courseContextText,
            // Note: ephemeral cache TTL is 5 min. If the user spends >5 min on the
            // picking step before confirming, this cache will miss on the first lesson rewrite.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cache_control: { type: 'ephemeral' } as any,
          },
          { type: 'text', text: lessonInstructions },
        ],
      },
    ],
  })

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      yield event.delta.text
    }
  }
}

// ---------------------------------------------------------------------------
// Parse a completed lesson markdown into a GeneratedLesson
// ---------------------------------------------------------------------------

export function parseLessonMarkdown(
  markdown: string,
  lessonNum: number,
  slug: string,
): GeneratedLesson {
  const titleMatch = markdown.match(/^## Lesson \d+:\s*(.+)$/m)
  const title = titleMatch?.[1]?.trim() ?? `Lesson ${lessonNum}`

  const subjectMatch = markdown.match(/\*\*Subject line:\*\*\s*(.+)$/m)
  const subjectLine = subjectMatch?.[1]?.trim().slice(0, 50) ?? title.slice(0, 50)

  const previewMatch = markdown.match(/\*\*Preview text:\*\*\s*(.+)$/m)
  const previewText = previewMatch?.[1]?.trim().slice(0, 90) ?? ''

  const takeawayMatch = markdown.match(/\*\*Key takeaway:\*\*\s*(.+)$/m)
  const keyTakeaway = takeawayMatch?.[1]?.trim() ?? ''

  const safeSlug = slug.replace(/[^a-z0-9-]/g, '-').slice(0, 40)
  const filename = `lesson-${String(lessonNum).padStart(2, '0')}-${safeSlug}.md`

  return {
    lessonNumber: lessonNum,
    title,
    subjectLine,
    previewText,
    markdownBody: markdown,
    keyTakeaway,
    filename,
  }
}
