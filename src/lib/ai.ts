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

// ---------------------------------------------------------------------------
// Curation (Step 1) — tool use for guaranteed structured output
// ---------------------------------------------------------------------------

const CURATION_TOOL: Anthropic.Messages.Tool = {
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
        maxItems: 5,
        items: {
          type: 'object',
          required: ['slug', 'sequencePosition', 'lessonFocus', 'selectionRationale'],
          properties: {
            slug: { type: 'string' },
            sequencePosition: { type: 'integer', minimum: 1, maximum: 5 },
            lessonFocus: { type: 'string', description: 'The specific angle or insight to emphasize in this lesson' },
            selectionRationale: { type: 'string', description: 'Why this post was chosen and how it serves the course arc' },
          },
        },
      },
    },
    required: ['courseTitle', 'courseDescription', 'targetAudience', 'overallRationale', 'lessons'],
  },
}

const CURATION_SYSTEM = `\
You are an expert instructional designer specializing in email courses.
Your job is to review a Substack newsletter archive and select posts that \
together form the best possible Educational Email Course (EEC).

An EEC is a sequence of short, actionable emails that teach a reader \
one coherent topic — delivered one lesson at a time.

## What makes a great EEC

- Has a single teachable throughline the reader can master by lesson 5
- Progresses logically — each lesson builds on the last (scaffolded learning)
- Starts with motivation ("why this matters") and ends with mastery or a \
  concrete next step
- Avoids time-sensitive content, news, product announcements, or posts that \
  feel stale outside their original context
- Avoids redundancy — each selected post contributes something distinct
- Favors posts with enough substance to fill a 3–5 minute read`

function formatPostsForCuration(posts: SubstackPost[]): string {
  return posts.map((p, i) =>
    [
      `[${i + 1}] slug: ${p.slug}`,
      `    title: ${p.title}`,
      p.subtitle ? `    subtitle: ${p.subtitle}` : null,
      `    published: ${p.publishedAt.slice(0, 10)}`,
      `    words: ${p.wordCount}`,
      `    excerpt: ${p.excerpt}`,
    ].filter(Boolean).join('\n')
  ).join('\n\n')
}

export async function curatePostSelection(posts: SubstackPost[]): Promise<CuratedSelection> {
  const prompt = `\
Below are ${posts.length} posts from a Substack newsletter archive.

${formatPostsForCuration(posts)}

---

Select exactly 5 posts (or fewer if the archive has fewer than 5 suitable posts) \
that together form the best EEC. The lessons array must be ordered by sequencePosition \
(1 = first email sent).`

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: CURATION_SYSTEM,
    tools: [CURATION_TOOL],
    tool_choice: { type: 'tool', name: 'select_course_posts' },
    messages: [{ role: 'user', content: prompt }],
  })

  const toolBlock = response.content.find(b => b.type === 'tool_use')
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    throw new Error('Claude did not return a tool call for curation')
  }

  const raw = toolBlock.input as {
    courseTitle: string
    courseDescription: string
    targetAudience: string
    overallRationale: string
    lessons: CuratedLesson[]
  }

  return {
    courseTitle: raw.courseTitle,
    courseDescription: raw.courseDescription,
    targetAudience: raw.targetAudience,
    overallRationale: raw.overallRationale,
    lessons: [...raw.lessons].sort((a, b) => a.sequencePosition - b.sequencePosition),
  }
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

**Next lesson:** [one-sentence teaser for the next lesson, or omit on lesson 5]`

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
    ? priorLessons.map(l => `  Lesson ${l.lessonNumber}: ${l.title} — ${l.keyTakeaway}`).join('\n')
    : '  (none yet)'

  return `<course>
<title>${selection.courseTitle}</title>
<description>${selection.courseDescription}</description>
<audience>${selection.targetAudience}</audience>
<arc>${selection.overallRationale}</arc>
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
${post.bodyText}
</source_material>

<lesson>
  <number>${lessonNum}</number>
  <focus>${focus}</focus>
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
