'use client'

import { useState, useEffect, useRef } from 'react'
import type { SubstackPost, GeneratedLesson, CurateSSEEvent, CuratedSelection } from '@/types'

type Step = 'input' | 'fetching' | 'picking' | 'generating' | 'review' | 'downloading'

type LogEntry = { text: string; done: boolean }

const SESSION_KEY = 'eec_lessons'
const SESSION_META_KEY = 'eec_meta'

interface CourseMeta {
  courseTitle: string
  courseDescription: string
}

function readSessionMeta(): CourseMeta | null {
  try {
    const raw = sessionStorage.getItem(SESSION_META_KEY)
    return raw ? (JSON.parse(raw) as CourseMeta) : null
  } catch {
    return null
  }
}

function writeSessionMeta(meta: CourseMeta) {
  try {
    sessionStorage.setItem(SESSION_META_KEY, JSON.stringify(meta))
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      console.warn('[substack2eec] sessionStorage quota exceeded — course meta will not be saved')
    }
  }
}

function clearSessionMeta() {
  try {
    sessionStorage.removeItem(SESSION_META_KEY)
  } catch {}
}

function readSessionLessons(): GeneratedLesson[] | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as GeneratedLesson[]) : null
  } catch {
    return null
  }
}

function writeSessionLessons(lessons: GeneratedLesson[]) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(lessons))
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      console.warn('[substack2eec] sessionStorage quota exceeded — lesson progress will not be saved on refresh')
    }
    // Silently ignore other errors (SSR environment, private browsing, etc.)
  }
}

function clearSessionLessons() {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {}
}

const EXAMPLES = [
  { label: 'Noahpinion',       url: 'https://noahpinion.substack.com' },
  { label: 'Astral Codex Ten', url: 'https://astralcodexten.substack.com' },
  { label: 'Not Boring',       url: 'https://notboring.substack.com' },
] as const

/**
 * Parse a Server-Sent Events stream of `CurateSSEEvent` JSON frames.
 *
 * Owns buffering across `read()` chunks, splits on `\n\n`, strips the `data: `
 * prefix, and `JSON.parse`s each frame. Malformed frames and non-`data:` lines
 * are silently skipped, matching the prior inline behavior.
 *
 * Exported for unit tests; not part of the component's public API.
 */
export async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<CurateSSEEvent> {
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) {
      if (!part.startsWith('data: ')) continue
      try {
        yield JSON.parse(part.slice(6)) as CurateSSEEvent
      } catch {
        // Malformed frame — skip, matching prior behavior.
      }
    }
  }
}

// Spark icon used in the generate button
function SparkIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M15.98 1.804a1 1 0 0 0-1.96 0l-.24 1.192a1 1 0 0 1-.784.785l-1.192.238a1 1 0 0 0 0 1.962l1.192.238a1 1 0 0 1 .785.785l.238 1.192a1 1 0 0 0 1.962 0l.238-1.192a1 1 0 0 1 .785-.785l1.192-.238a1 1 0 0 0 0-1.962l-1.192-.238a1 1 0 0 1-.785-.785l-.238-1.192ZM6.949 5.684a1 1 0 0 0-1.898 0l-.683 2.051a1 1 0 0 1-.633.633l-2.051.683a1 1 0 0 0 0 1.898l2.051.684a1 1 0 0 1 .633.632l.683 2.051a1 1 0 0 0 1.898 0l.683-2.051a1 1 0 0 1 .633-.633l2.051-.683a1 1 0 0 0 0-1.897l-2.051-.683a1 1 0 0 1-.633-.633L6.95 5.684Z" />
    </svg>
  )
}

export default function ReviewForm() {
  const [step, setStep] = useState<Step>('input')
  const [url, setUrl] = useState('')
  const [lessons, setLessons] = useState<GeneratedLesson[]>([])
  const [courseMeta, setCourseMeta] = useState<CourseMeta>({ courseTitle: '', courseDescription: '' })
  const [fetchedPosts, setFetchedPosts] = useState<SubstackPost[]>([])
  const [candidates, setCandidates] = useState<CuratedSelection[]>([])
  const [streamLog, setStreamLog] = useState<LogEntry[]>([])
  const [slowWarning, setSlowWarning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [skippedCount, setSkippedCount] = useState(0)
  const [expectedLessonCount, setExpectedLessonCount] = useState<number>(5)
  const [completedLessonCount, setCompletedLessonCount] = useState(0)

  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // On mount: restore from sessionStorage if available
  useEffect(() => {
    const saved = readSessionLessons()
    const meta = readSessionMeta()
    if (saved && saved.length > 0) {
      setLessons(saved)
      setExpectedLessonCount(saved.length)
      if (meta) setCourseMeta(meta)
      setStep('review')
    }
  }, [])

  function updateLessons(updated: GeneratedLesson[]) {
    setLessons(updated)
    writeSessionLessons(updated)
  }

  function startSlowTimer() {
    slowTimerRef.current = setTimeout(() => setSlowWarning(true), 90_000)
  }

  function clearSlowTimer() {
    if (slowTimerRef.current) {
      clearTimeout(slowTimerRef.current)
      slowTimerRef.current = null
    }
    setSlowWarning(false)
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setStreamLog([])
    setExpectedLessonCount(5)
    setCompletedLessonCount(0)
    setStep('fetching')

    let posts: SubstackPost[]
    try {
      const res = await fetch('/api/fetch-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to fetch posts')
        setStep('input')
        return
      }
      posts = data.posts
      setFetchedPosts(posts)
      setSkippedCount(data.skippedCount ?? 0)
    } catch {
      setError('Network error while fetching posts. Please try again.')
      setStep('input')
      return
    }

    try {
      const res = await fetch('/api/propose-courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          posts: posts.map(({ bodyText: _bt, bodyHtml: _bh, ...meta }) => meta),
          lessonCount: 5,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to generate course candidates')
        setStep('input')
        return
      }
      setCandidates(data.candidates)
      setStep('picking')
    } catch {
      setError('Network error while generating candidates. Please try again.')
      setStep('input')
    }
  }

  async function handleConfirmCandidate(candidate: CuratedSelection, posts: SubstackPost[]) {
    setCourseMeta({ courseTitle: candidate.courseTitle, courseDescription: candidate.courseDescription })
    writeSessionMeta({ courseTitle: candidate.courseTitle, courseDescription: candidate.courseDescription })
    setStreamLog([])
    setExpectedLessonCount(candidate.lessons.length)
    setCompletedLessonCount(0)
    setStep('generating')
    startSlowTimer()

    const inProgressLessons: GeneratedLesson[] = []

    try {
      const res = await fetch('/api/curate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posts, lessonCount: candidate.lessons.length, selectedCourse: candidate }),
      })

      if (!res.ok || !res.body) {
        setError('Failed to start course generation')
        setStep('picking')
        clearSlowTimer()
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          if (!part.startsWith('data: ')) continue
          let event: CurateSSEEvent
          try {
            event = JSON.parse(part.slice(6)) as CurateSSEEvent
          } catch {
            continue
          }

          // courseMeta already set from confirmed candidate — selection event is informational only
          if (event.type === 'selection') {
            setStreamLog(prev => [...prev, { text: `Course: "${event.data.courseTitle}"`, done: false }])
          } else if (event.type === 'lesson_start') {
            setStreamLog(prev => [...prev, { text: `Writing lesson ${event.lessonNumber}…`, done: false }])
          } else if (event.type === 'lesson_done') {
            inProgressLessons.push(event.lesson)
            writeSessionLessons([...inProgressLessons])
            setCompletedLessonCount(inProgressLessons.length)
            setStreamLog(prev => [...prev, { text: `Lesson ${event.lesson.lessonNumber}: ${event.lesson.title}`, done: true }])
          } else if (event.type === 'done') {
            clearSlowTimer()
            updateLessons(event.lessons)
            setStep('review')
            return
          } else if (event.type === 'error') {
            clearSlowTimer()
            setError(event.message)
            // If we have partial lessons, let user review what arrived
            if (inProgressLessons.length > 0) {
              updateLessons(inProgressLessons)
              setStep('review')
            } else {
              setStep('picking')
            }
            return
          }
        }
      }
    } catch {
      clearSlowTimer()
      // Recover partial lessons from sessionStorage if stream died
      const saved = readSessionLessons()
      const meta = readSessionMeta()
      if (saved && saved.length > 0) {
        setLessons(saved)
        if (meta) setCourseMeta(meta)
        setError('Generation interrupted. Showing lessons completed so far.')
        setStep('review')
      } else {
        setError('Network error during generation. Please try again.')
        setStep('picking')
      }
    }
  }

  async function handleDownload() {
    setStep('downloading')
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessons, courseTitle: courseMeta.courseTitle, courseDescription: courseMeta.courseDescription }),
      })
      if (!res.ok) {
        setError('Failed to generate ZIP. Please try again.')
        setStep('review')
        return
      }
      const blob = await res.blob()
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = 'eec-course.zip'
      a.click()
      setTimeout(() => URL.revokeObjectURL(href), 60_000)
      setStep('review')
    } catch {
      setError('Download failed. Please try again.')
      setStep('review')
    }
  }

  function handleStartOver() {
    clearSessionLessons()
    clearSessionMeta()
    setLessons([])
    setCourseMeta({ courseTitle: '', courseDescription: '' })
    setFetchedPosts([])
    setCandidates([])
    setStreamLog([])
    setError(null)
    setSkippedCount(0)
    setExpectedLessonCount(5)
    setCompletedLessonCount(0)
    setStep('input')
  }

  const handleLessonEdit = (index: number, value: string) => {
    setLessons(prev => {
      const updated = prev.map((l, i) =>
        i === index ? { ...l, markdownBody: value } : l
      )
      writeSessionLessons(updated)
      return updated
    })
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-col min-h-screen bg-background page-gradient">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-16">

        {/* Page header — fetching / picking / generating states */}
        {(step === 'fetching' || step === 'picking' || step === 'generating') && (
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/5 border border-teal-primary/20 mb-6">
              <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 text-teal-primary">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                <path d="M6 12v5c3 3 9 3 12 0v-5" />
              </svg>
            </div>
            <h1 className="text-4xl font-light tracking-tight text-foreground mb-3">Substack to Email Course</h1>
            <p className="text-teal-subtle text-lg max-w-md mx-auto">
              Transform your Substack newsletter into engaging educational email courses.
              Get 2–3 unique course variations with lessons, takeaways, and action items.
            </p>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="w-full max-w-2xl mb-6 rounded-lg bg-red-950/50 border border-red-700/40 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* ── INPUT ── */}
        {step === 'input' && (
          <div className="w-full max-w-2xl">
            {/* Eyebrow */}
            <div className="flex items-center gap-3 mb-4">
              <span className="block w-6 h-px bg-teal-primary opacity-70" />
              <span className="font-mono text-[11px] font-medium tracking-[0.18em] uppercase text-teal-primary">
                Educational Email Courses
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl font-light leading-tight tracking-tight text-foreground mb-3">
              Transform your{' '}
              <em className="not-italic font-semibold text-teal-accent">Substack</em>{' '}
              archive
            </h1>
            <p className="text-teal-subtle text-base mb-8 max-w-sm leading-relaxed">
              Paste any Substack URL and get 2–3 ready-to-send email course variations built from your best content.
            </p>

            {/* Form card */}
            <div className="rounded-2xl border border-teal-primary/20 bg-white/5 p-6">
              <form onSubmit={handleGenerate}>
                {/* URL row */}
                <div className="flex gap-3 mb-5">
                  <input
                    type="url"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder="https://yourname.substack.com"
                    required
                    className="flex-1 min-w-0 rounded-lg border border-teal-primary/20 bg-ink-deeper/80 px-4 py-3 font-mono text-sm text-teal-light placeholder-teal-subtle/80 focus:outline-none focus:ring-2 focus:ring-teal-primary/40 focus:border-teal-primary/60"
                  />
                  <button
                    type="submit"
                    disabled={!url || step !== 'input'}
                    className="inline-flex items-center gap-2 rounded-lg bg-teal-primary px-5 py-3 text-sm font-semibold text-ink-on-teal transition-colors hover:bg-teal-hover disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <SparkIcon className="w-4 h-4" />
                    Generate
                  </button>
                </div>

                {/* Examples */}
                <p className="font-mono text-[10.5px] font-medium tracking-[0.14em] uppercase text-teal-dim mb-2">
                  Try an example
                </p>
                <div className="flex flex-wrap gap-2 mb-5">
                  {EXAMPLES.map(ex => (
                    <button
                      key={ex.label}
                      type="button"
                      onClick={() => setUrl(ex.url)}
                      className="rounded-full border border-teal-primary/20 bg-teal-primary/10 px-4 py-1.5 text-sm text-teal-mid transition-colors hover:bg-teal-primary/15 hover:text-teal-lightest"
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>

                {/* Divider */}
                <div className="h-px bg-teal-primary/10 mb-4" />

                {/* Feature tags */}
                <div className="flex flex-wrap gap-5">
                  {['3–5 emails per course', 'Key takeaways', 'Action items'].map(tag => (
                    <span key={tag} className="flex items-center gap-1.5 font-mono text-[11px] text-teal-dim">
                      <span className="inline-block w-1 h-1 rounded-full bg-teal-primary opacity-60" />
                      {tag}
                    </span>
                  ))}
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── FETCHING ── */}
        {step === 'fetching' && (
          <div className="w-full max-w-2xl rounded-2xl border border-teal-primary/15 bg-white/5 px-8 py-12 text-center">
            <p className="font-mono text-sm text-teal-mid animate-pulse">Fetching posts from Substack…</p>
          </div>
        )}

        {/* ── PICKING ── */}
        {step === 'picking' && (
          <div className="w-full max-w-4xl">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-light text-foreground mb-2">Choose your course theme</h2>
              <p className="text-teal-subtle text-base max-w-md mx-auto">
                We found 3 different courses you could build from this newsletter. Pick the one that fits your audience.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {candidates.map((candidate, i) => (
                <div
                  key={candidate.courseTitle}
                  className="rounded-xl border border-teal-primary/15 bg-white/5 overflow-hidden flex flex-col"
                >
                  <div className="px-5 py-5 flex-1">
                    <p className="font-mono text-[10px] font-medium uppercase tracking-widest text-teal-dim mb-2">
                      Option {i + 1}
                    </p>
                    <h3 className="text-base font-medium text-foreground mb-2 leading-snug">{candidate.courseTitle}</h3>
                    <p className="text-sm text-teal-subtle mb-4 line-clamp-3">{candidate.courseDescription}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center rounded-full bg-teal-primary/10 border border-teal-primary/20 px-2.5 py-0.5 font-mono text-xs text-teal-mid">
                        {candidate.lessons.length} lessons
                      </span>
                      <span className="inline-flex items-center rounded-full bg-teal-primary/10 border border-teal-primary/20 px-2.5 py-0.5 font-mono text-xs text-teal-mid max-w-[160px] overflow-hidden">
                        <span className="truncate min-w-0">{candidate.targetAudience}</span>
                      </span>
                    </div>
                  </div>
                  <div className="px-5 pb-5">
                    <button
                      onClick={() => handleConfirmCandidate(candidate, fetchedPosts)}
                      className="w-full rounded-lg bg-teal-primary px-4 py-2.5 text-sm font-semibold text-ink-on-teal hover:bg-teal-hover transition-colors"
                    >
                      Choose this course →
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-center">
              <button
                onClick={handleStartOver}
                className="font-mono text-sm text-teal-dim hover:text-teal-mid transition-colors"
              >
                ← Start over
              </button>
            </div>
          </div>
        )}

        {/* ── GENERATING ── */}
        {step === 'generating' && (
          <div className="w-full max-w-2xl rounded-2xl border border-teal-primary/15 bg-white/5 px-8 py-10 space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-mono text-sm text-teal-mid animate-pulse">Generating your course…</p>
              {completedLessonCount > 0 && (
                <span className="font-mono text-sm tabular-nums text-teal-subtle">
                  {completedLessonCount} / {expectedLessonCount} lessons
                </span>
              )}
            </div>
            {completedLessonCount > 0 && (
              <div className="h-1.5 w-full rounded-full bg-white/10">
                <div
                  className="h-1.5 rounded-full bg-teal-primary transition-all duration-500"
                  style={{ width: `${(completedLessonCount / expectedLessonCount) * 100}%` }}
                />
              </div>
            )}
            {slowWarning && (
              <div className="rounded-lg bg-amber-950/50 border border-amber-700/40 px-4 py-3 text-sm text-amber-300">
                This is taking longer than usual — still working…
              </div>
            )}
            <ul className="space-y-1.5 text-sm">
              {streamLog.map((entry, i) => (
                // stable enough — entries are append-only
                <li key={i} className={['flex items-start gap-2', entry.done ? 'text-teal-light' : 'text-teal-dim'].join(' ')}>
                  {entry.done
                    ? <span className="mt-0.5 text-teal-primary shrink-0">✓</span>
                    : <span className="mt-0.5 shrink-0 text-teal-dim">·</span>
                  }
                  <span className="font-mono">{entry.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── REVIEW ── */}
        {step === 'review' && (
          <div className="w-full max-w-3xl space-y-8">
            {courseMeta.courseTitle && (
              <div className="rounded-lg border border-teal-primary/15 bg-white/5 px-4 py-3">
                <p className="font-mono text-[10px] font-medium uppercase tracking-widest text-teal-dim mb-0.5">Course</p>
                <p className="text-base font-medium text-foreground">{courseMeta.courseTitle}</p>
                {courseMeta.courseDescription && (
                  <p className="mt-1 text-sm text-teal-subtle">{courseMeta.courseDescription}</p>
                )}
              </div>
            )}
            {skippedCount > 0 && (
              <p className="font-mono text-sm text-teal-dim">
                {skippedCount} paywalled post{skippedCount !== 1 ? 's' : ''} were skipped.
              </p>
            )}
            {lessons.length < expectedLessonCount && (
              <p className="font-mono text-sm text-amber-400/80">
                Only {lessons.length} suitable public post{lessons.length !== 1 ? 's' : ''} found — course is shorter than expected.
              </p>
            )}

            {lessons.map((lesson, i) => (
              <div key={lesson.lessonNumber} className="rounded-xl border border-teal-primary/15 bg-white/5 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-teal-primary/10 bg-white/[0.03]">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-primary font-mono text-xs font-bold text-ink-on-teal">
                    {lesson.lessonNumber}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-foreground" title={lesson.title}>{lesson.title}</p>
                    <p className="truncate font-mono text-xs text-teal-dim mt-0.5">Subject: {lesson.subjectLine}</p>
                  </div>
                  <span className="shrink-0 font-mono text-xs text-teal-dim hidden sm:block">{lesson.filename}</span>
                </div>
                <textarea
                  value={lesson.markdownBody}
                  onChange={e => handleLessonEdit(i, e.target.value)}
                  rows={20}
                  className="w-full px-4 py-3 font-mono text-xs text-teal-light bg-transparent focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-primary/30 resize-y"
                />
              </div>
            ))}

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleDownload}
                className="rounded-lg bg-teal-primary px-5 py-2.5 text-sm font-semibold text-ink-on-teal hover:bg-teal-hover transition-colors"
              >
                Download ZIP
              </button>
              <button
                onClick={handleStartOver}
                className="rounded-lg border border-teal-primary/20 px-5 py-2.5 text-sm font-medium text-teal-mid hover:bg-teal-primary/10 transition-colors"
              >
                Start Over
              </button>
            </div>
          </div>
        )}

        {/* ── DOWNLOADING ── */}
        {step === 'downloading' && (
          <div className="w-full max-w-2xl rounded-2xl border border-teal-primary/15 bg-white/5 px-8 py-12 text-center">
            <p className="font-mono text-sm text-teal-mid animate-pulse">Preparing your ZIP…</p>
          </div>
        )}

      </div>

      {/* Footer */}
      <footer className="py-6 text-center font-mono text-xs text-teal-dim tracking-wide">
        Powered by AI · Enter any Substack URL to get started
      </footer>
    </div>
  )
}
