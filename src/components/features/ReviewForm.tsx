'use client'

import { useState, useEffect, useRef } from 'react'
import type { SubstackPost, GeneratedLesson, CurateSSEEvent, LessonCount } from '@/types'
import { ALLOWED_LESSON_COUNTS } from '@/types'

type Step = 'input' | 'fetching' | 'generating' | 'review' | 'downloading'

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
  } catch {}
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
  } catch {
    // sessionStorage not available (SSR guard)
  }
}

function clearSessionLessons() {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {}
}

export default function ReviewForm() {
  const [step, setStep] = useState<Step>('input')
  const [url, setUrl] = useState('')
  const [lessonCount, setLessonCount] = useState<LessonCount>(5)
  const [lessons, setLessons] = useState<GeneratedLesson[]>([])
  const [courseMeta, setCourseMeta] = useState<CourseMeta>({ courseTitle: '', courseDescription: '' })
  const [streamLog, setStreamLog] = useState<string[]>([])
  const [slowWarning, setSlowWarning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [skippedCount, setSkippedCount] = useState(0)
  const [expectedLessonCount, setExpectedLessonCount] = useState<number>(lessonCount)
  const [completedLessonCount, setCompletedLessonCount] = useState(0)

  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // On mount: restore from sessionStorage if available
  useEffect(() => {
    const saved = readSessionLessons()
    const meta = readSessionMeta()
    if (saved && saved.length > 0) {
      setLessons(saved)
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
    setExpectedLessonCount(lessonCount)
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
      setSkippedCount(data.skippedCount ?? 0)
    } catch {
      setError('Network error while fetching posts. Please try again.')
      setStep('input')
      return
    }

    // Step 2: Stream curation + rewriting
    setStep('generating')
    startSlowTimer()

    const inProgressLessons: GeneratedLesson[] = []

    try {
      const res = await fetch('/api/curate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posts, lessonCount }),
      })

      if (!res.ok || !res.body) {
        setError('Failed to start course generation')
        setStep('input')
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
            const meta = { courseTitle: event.data.courseTitle, courseDescription: event.data.courseDescription }
            setCourseMeta(meta)
            writeSessionMeta(meta)
            setExpectedLessonCount(event.data.lessons.length)
            setStreamLog(prev => [...prev, `Course: "${event.data.courseTitle}"`])
          } else if (event.type === 'lesson_start') {
            setStreamLog(prev => [...prev, `Writing lesson ${event.lessonNumber}…`])
          } else if (event.type === 'lesson_done') {
            inProgressLessons.push(event.lesson)
            // Append to sessionStorage as each lesson arrives
            writeSessionLessons([...inProgressLessons])
            setCompletedLessonCount(inProgressLessons.length)
            setStreamLog(prev => [...prev, `✓ Lesson ${event.lesson.lessonNumber}: ${event.lesson.title}`])
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
              setStep('input')
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
        setStep('input')
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
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'eec-course.zip'
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      setError('Download failed. Please try again.')
    }
    setStep('review')
  }

  function handleStartOver() {
    clearSessionLessons()
    clearSessionMeta()
    setLessons([])
    setCourseMeta({ courseTitle: '', courseDescription: '' })
    setStreamLog([])
    setError(null)
    setSkippedCount(0)
    setExpectedLessonCount(lessonCount)
    setCompletedLessonCount(0)
    setStep('input')
  }

  function handleLessonEdit(index: number, value: string) {
    const updated = lessons.map((l, i) =>
      i === index ? { ...l, markdownBody: value } : l
    )
    updateLessons(updated)
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="flex items-center gap-3 mb-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path d="M3 4a2 2 0 0 0-2 2v1.161l8.441 4.221a1.25 1.25 0 0 0 1.118 0L19 7.162V6a2 2 0 0 0-2-2H3Z" />
            <path d="m19 8.839-7.77 3.885a2.75 2.75 0 0 1-2.46 0L1 8.839V14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.839Z" />
          </svg>
        </span>
        <h1 className="text-2xl font-bold tracking-tight">Substack to Email Course</h1>
      </div>
      <p className="text-gray-500 mb-8 text-sm">
        Paste a Substack URL and get a {lessonCount}-lesson email course, ready to export.
      </p>

      {error && (
        <div className="mb-6 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* INPUT */}
      {step === 'input' && (
        <form onSubmit={handleGenerate} className="space-y-4">
          <div className="flex gap-3">
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://example.substack.com"
              required
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Generate Course
            </button>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-gray-700">Length:</span>
            <div className="flex gap-1">
              {ALLOWED_LESSON_COUNTS.map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setLessonCount(n)}
                  className={[
                    'rounded-full px-3 py-1 text-sm font-medium transition-colors',
                    lessonCount === n
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white border border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600',
                  ].join(' ')}
                >
                  {n}
                </button>
              ))}
            </div>
            <span className="text-gray-400">lessons</span>
          </div>
        </form>
      )}

      {/* FETCHING */}
      {step === 'fetching' && (
        <div className="text-sm text-gray-500 animate-pulse">Fetching posts from Substack…</div>
      )}

      {/* GENERATING */}
      {step === 'generating' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700 animate-pulse">Generating your course…</p>
            {completedLessonCount > 0 && (
              <span className="text-sm font-semibold tabular-nums text-indigo-600">
                {completedLessonCount} / {expectedLessonCount} lessons
              </span>
            )}
          </div>
          {completedLessonCount > 0 && (
            <div className="h-1.5 w-full rounded-full bg-gray-100">
              <div
                className="h-1.5 rounded-full bg-indigo-500 transition-all duration-500"
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
            {streamLog.map((line, i) => (
              <li key={i} className={['flex items-start gap-2', line.startsWith('✓') ? 'text-gray-700' : 'text-gray-400'].join(' ')}>
                {line.startsWith('✓')
                  ? <span className="mt-0.5 text-green-500 shrink-0">✓</span>
                  : <span className="mt-0.5 shrink-0 text-gray-300">·</span>
                }
                <span>{line.startsWith('✓') ? line.slice(2) : line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* REVIEW */}
      {step === 'review' && (
        <div className="space-y-8">
          {courseMeta.courseTitle && (
            <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-indigo-400 mb-0.5">Course</p>
              <p className="text-base font-semibold text-indigo-900">{courseMeta.courseTitle}</p>
              {courseMeta.courseDescription && (
                <p className="mt-1 text-sm text-indigo-700">{courseMeta.courseDescription}</p>
              )}
            </div>
          )}
          {skippedCount > 0 && (
            <p className="text-sm text-gray-500">
              {skippedCount} paywalled post{skippedCount !== 1 ? 's' : ''} were skipped.
            </p>
          )}
          {lessons.length < lessonCount && (
            <p className="text-sm text-amber-600">
              Only {lessons.length} suitable public post{lessons.length !== 1 ? 's' : ''} found — course is shorter than {lessonCount} lessons.
            </p>
          )}

          {lessons.map((lesson, i) => (
            <div key={lesson.lessonNumber} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
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
                className="w-full px-4 py-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 resize-y"
              />
            </div>
          ))}

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleDownload}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Download ZIP
            </button>
            <button
              onClick={handleStartOver}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Start Over
            </button>
          </div>
        </div>
      )}

      {/* DOWNLOADING */}
      {step === 'downloading' && (
        <div className="text-sm text-gray-500 animate-pulse">Preparing your ZIP…</div>
      )}
    </div>
  )
}
