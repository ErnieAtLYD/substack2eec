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
    // Silently ignore other errors (SSR environment, private mode, etc.)
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

    // Step 1: Fetch posts
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

    // Step 2: Propose course candidates for user to pick
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

          if (event.type === 'selection') {
            // courseMeta already set from confirmed candidate — selection event is informational only
            setStreamLog(prev => [...prev, { text: `Course: "${event.data.courseTitle}"`, done: false }])
          } else if (event.type === 'lesson_start') {
            setStreamLog(prev => [...prev, { text: `Writing lesson ${event.lessonNumber}…`, done: false }])
          } else if (event.type === 'lesson_done') {
            inProgressLessons.push(event.lesson)
            // Append to sessionStorage as each lesson arrives
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
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-16">

        {/* Page header — not shown during input because the card has its own icon+heading */}
        {(step === 'fetching' || step === 'picking' || step === 'generating') && (
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gray-100 mb-6">
              <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 text-gray-700">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                <path d="M6 12v5c3 3 9 3 12 0v-5" />
              </svg>
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 mb-3">Substack to Email Course</h1>
            <p className="text-gray-500 text-lg max-w-md mx-auto">
              Transform your Substack newsletter into engaging educational email courses.
              Get 2–3 unique course variations with lessons, takeaways, and action items.
            </p>
          </div>
        )}

        {error && (
          <div className="w-full max-w-2xl mb-6 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* INPUT */}
        {step === 'input' && (
          <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white shadow-lg px-8 pt-8 pb-8">
            {/* Card icon + heading */}
            <div className="flex flex-col items-center text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-100 mb-5">
                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7 text-gray-700">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Transform Your Substack</h2>
              <p className="text-gray-500 text-base max-w-sm">
                Enter your Substack URL and we will create 2–3 educational email course variations from your content
              </p>
            </div>

            {/* URL input + button */}
            <form onSubmit={handleGenerate}>
              <div className="flex gap-3 mb-5">
                <input
                  type="url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://yourname.substack.com"
                  required
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400"
                />
                <button
                  type="submit"
                  disabled={!url || step !== 'input'}
                  className="inline-flex items-center gap-2 rounded-lg bg-gray-500 hover:bg-gray-600 px-5 py-3 text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M15.98 1.804a1 1 0 0 0-1.96 0l-.24 1.192a1 1 0 0 1-.784.785l-1.192.238a1 1 0 0 0 0 1.962l1.192.238a1 1 0 0 1 .785.785l.238 1.192a1 1 0 0 0 1.962 0l.238-1.192a1 1 0 0 1 .785-.785l1.192-.238a1 1 0 0 0 0-1.962l-1.192-.238a1 1 0 0 1-.785-.785l-.238-1.192ZM6.949 5.684a1 1 0 0 0-1.898 0l-.683 2.051a1 1 0 0 1-.633.633l-2.051.683a1 1 0 0 0 0 1.898l2.051.684a1 1 0 0 1 .633.632l.683 2.051a1 1 0 0 0 1.898 0l.683-2.051a1 1 0 0 1 .633-.633l2.051-.683a1 1 0 0 0 0-1.897l-2.051-.683a1 1 0 0 1-.633-.633L6.95 5.684Z" />
                  </svg>
                  Generate Courses
                  <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>

              {/* Examples */}
              <div className="text-center mb-6">
                <p className="text-sm text-gray-500 mb-3">Try an example:</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {EXAMPLES.map(ex => (
                    <button
                      key={ex.label}
                      type="button"
                      onClick={() => setUrl(ex.url)}
                      className="rounded-full border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:border-gray-400 hover:bg-gray-50 transition-colors"
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Feature badges */}
              <div className="flex items-center justify-center gap-2 text-xs text-gray-400 flex-wrap">
                <span>3–5 emails per course</span>
                <span>·</span>
                <span>Key takeaways included</span>
                <span>·</span>
                <span>Action items for readers</span>
              </div>
            </form>
          </div>
        )}

        {/* FETCHING */}
        {step === 'fetching' && (
          <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white shadow-lg px-8 py-12 text-center">
            <p className="text-sm text-gray-500 animate-pulse">Fetching posts from Substack…</p>
          </div>
        )}

        {/* PICKING */}
        {step === 'picking' && (
          <div className="w-full max-w-4xl">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Choose your course theme</h2>
              <p className="text-gray-500 text-base max-w-md mx-auto">
                We found 3 different courses you could build from this newsletter. Pick the one that fits your audience.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {candidates.map((candidate, i) => (
                <div
                  key={candidate.courseTitle}
                  className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col"
                >
                  <div className="px-5 py-5 flex-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-2">Option {i + 1}</p>
                    <h3 className="text-base font-semibold text-gray-900 mb-2 leading-snug">{candidate.courseTitle}</h3>
                    <p className="text-sm text-gray-500 mb-4 line-clamp-3">{candidate.courseDescription}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">
                        {candidate.lessons.length} lessons
                      </span>
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600 max-w-[160px] truncate">
                        {candidate.targetAudience}
                      </span>
                    </div>
                  </div>
                  <div className="px-5 pb-5">
                    <button
                      onClick={() => handleConfirmCandidate(candidate, fetchedPosts)}
                      className="w-full rounded-lg bg-gray-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
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
                className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                ← Start over
              </button>
            </div>
          </div>
        )}

        {/* GENERATING */}
        {step === 'generating' && (
          <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white shadow-lg px-8 py-10 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700 animate-pulse">Generating your course…</p>
              {completedLessonCount > 0 && (
                <span className="text-sm font-semibold tabular-nums text-gray-600">
                  {completedLessonCount} / {expectedLessonCount} lessons
                </span>
              )}
            </div>
            {completedLessonCount > 0 && (
              <div className="h-1.5 w-full rounded-full bg-gray-100">
                <div
                  className="h-1.5 rounded-full bg-gray-500 transition-all duration-500"
                  style={{ width: `${(completedLessonCount / expectedLessonCount) * 100}%` }}
                />
              </div>
            )}
            {slowWarning && (
              <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
                This is taking longer than usual — still working…
              </div>
            )}
            <ul className="space-y-1.5 text-sm">
              {streamLog.map((entry, i) => (
                // stable enough — entries are append-only
                <li key={i} className={['flex items-start gap-2', entry.done ? 'text-gray-700' : 'text-gray-400'].join(' ')}>
                  {entry.done
                    ? <span className="mt-0.5 text-green-500 shrink-0">✓</span>
                    : <span className="mt-0.5 shrink-0 text-gray-300">·</span>
                  }
                  <span>{entry.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* REVIEW */}
        {step === 'review' && (
          <div className="w-full max-w-3xl space-y-8">
            {courseMeta.courseTitle && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-0.5">Course</p>
                <p className="text-base font-semibold text-gray-900">{courseMeta.courseTitle}</p>
                {courseMeta.courseDescription && (
                  <p className="mt-1 text-sm text-gray-600">{courseMeta.courseDescription}</p>
                )}
              </div>
            )}
            {skippedCount > 0 && (
              <p className="text-sm text-gray-500">
                {skippedCount} paywalled post{skippedCount !== 1 ? 's' : ''} were skipped.
              </p>
            )}
            {lessons.length < expectedLessonCount && (
              <p className="text-sm text-amber-600">
                Only {lessons.length} suitable public post{lessons.length !== 1 ? 's' : ''} found — course is shorter than expected.
              </p>
            )}

            {lessons.map((lesson, i) => (
              <div key={lesson.lessonNumber} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-700 text-xs font-bold text-white">
                    {lesson.lessonNumber}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-gray-800" title={lesson.title}>{lesson.title}</p>
                    <p className="truncate text-xs text-gray-400 mt-0.5">Subject: {lesson.subjectLine}</p>
                  </div>
                  <span className="shrink-0 font-mono text-xs text-gray-300 hidden sm:block">{lesson.filename}</span>
                </div>
                <textarea
                  value={lesson.markdownBody}
                  onChange={e => handleLessonEdit(i, e.target.value)}
                  rows={20}
                  className="w-full px-4 py-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-inset focus:ring-gray-400 resize-y"
                />
              </div>
            ))}

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleDownload}
                className="rounded-lg bg-gray-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
              >
                Download ZIP
              </button>
              <button
                onClick={handleStartOver}
                className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Start Over
              </button>
            </div>
          </div>
        )}

        {/* DOWNLOADING */}
        {step === 'downloading' && (
          <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white shadow-lg px-8 py-12 text-center">
            <p className="text-sm text-gray-500 animate-pulse">Preparing your ZIP…</p>
          </div>
        )}

      </div>

      {/* Footer */}
      <footer className="py-6 text-center text-sm text-gray-400">
        Powered by AI. Enter any Substack URL to get started.
      </footer>
    </div>
  )
}
