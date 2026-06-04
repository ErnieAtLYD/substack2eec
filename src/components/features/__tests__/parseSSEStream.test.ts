import { describe, it, expect } from 'vitest'
import { parseSSEStream } from '../ReviewForm'
import { MAX_SSE_BUFFER_CHARS } from '@/lib/limits'
import type { CurateSSEEvent } from '@/types'

/**
 * Build a `ReadableStreamDefaultReader<Uint8Array>` from a list of byte chunks.
 * Each chunk is enqueued as a single `read()` call's worth of data.
 */
function makeReader(chunks: Uint8Array[]): ReadableStreamDefaultReader<Uint8Array> {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
  return stream.getReader()
}

const enc = new TextEncoder()

async function collect(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<CurateSSEEvent[]> {
  const out: CurateSSEEvent[] = []
  for await (const event of parseSSEStream(reader)) out.push(event)
  return out
}

describe('parseSSEStream', () => {
  it('parses a single complete data frame', async () => {
    const event = { type: 'lesson_start', lessonNumber: 1 } as const
    const reader = makeReader([enc.encode(`data: ${JSON.stringify(event)}\n\n`)])
    const events = await collect(reader)
    expect(events).toEqual([event])
  })

  it('reassembles a frame split across two read() chunks', async () => {
    const event = { type: 'lesson_start', lessonNumber: 7 } as const
    const full = `data: ${JSON.stringify(event)}\n\n`
    const split = Math.floor(full.length / 2)
    const reader = makeReader([
      enc.encode(full.slice(0, split)),
      enc.encode(full.slice(split)),
    ])
    const events = await collect(reader)
    expect(events).toEqual([event])
  })

  it('silently skips a malformed JSON frame and keeps parsing later frames', async () => {
    const good = { type: 'lesson_start', lessonNumber: 2 } as const
    const reader = makeReader([
      enc.encode('data: {not-valid-json\n\n'),
      enc.encode(`data: ${JSON.stringify(good)}\n\n`),
    ])
    const events = await collect(reader)
    expect(events).toEqual([good])
  })

  it('silently skips a non-data: line', async () => {
    const event = { type: 'lesson_start', lessonNumber: 3 } as const
    const reader = makeReader([
      enc.encode(`event: ping\n\ndata: ${JSON.stringify(event)}\n\n`),
    ])
    const events = await collect(reader)
    expect(events).toEqual([event])
  })

  it('decodes a multi-byte UTF-8 character split across chunks', async () => {
    // "naïve" — the ï (U+00EF) is two UTF-8 bytes (0xC3 0xAF).
    // Splitting between those bytes verifies the streaming decoder.
    const event = { type: 'lesson_done', lesson: { title: 'naïve', lessonNumber: 1 } }
    const fullBytes = enc.encode(`data: ${JSON.stringify(event)}\n\n`)

    // Find the byte index of the ï's first byte (0xC3) and split between the two bytes.
    const splitIdx = fullBytes.indexOf(0xc3) + 1
    expect(splitIdx).toBeGreaterThan(0) // sanity: we actually found it

    const reader = makeReader([
      fullBytes.slice(0, splitIdx),
      fullBytes.slice(splitIdx),
    ])
    const events = await collect(reader)
    expect(events).toHaveLength(1)
    // Cast: lesson_done shape isn't our concern here — we want the decoded title.
    const first = events[0] as Extract<CurateSSEEvent, { type: 'lesson_done' }>
    expect(first.lesson.title).toBe('naïve')
  })

  it('throws when an unterminated frame exceeds the buffer cap (#149)', async () => {
    // A response that never emits a \n\n terminator must not grow the buffer
    // without bound (tab OOM). One oversized chunk past the cap, no terminator.
    const reader = makeReader([enc.encode('data: ' + 'x'.repeat(MAX_SSE_BUFFER_CHARS + 1))])
    await expect(collect(reader)).rejects.toThrow(/SSE buffer/)
  })

  it('does not throw on valid frames whose cumulative size exceeds the cap (#149)', async () => {
    // The cap is on the unterminated remainder, not total throughput: each frame
    // here completes with \n\n, so the buffer is drained every iteration even
    // though the running total far exceeds MAX_SSE_BUFFER_CHARS. Few large frames
    // (not many tiny ones) so test cost doesn't scale with the cap constant (#183).
    const oneFrame = `data: ${JSON.stringify({ type: 'lesson_chunk', lessonNumber: 1, text: 'x'.repeat(400_000) })}\n\n`
    const frameCount = 5
    // Pin the relationship the fixture relies on, so a cap increase can't
    // silently turn this into a does-not-exceed test.
    expect(frameCount * oneFrame.length).toBeGreaterThan(MAX_SSE_BUFFER_CHARS)
    const chunks = Array.from({ length: frameCount }, () => enc.encode(oneFrame))
    const events = await collect(makeReader(chunks))
    expect(events).toHaveLength(frameCount)
  })

  it('does not throw on an unterminated remainder of exactly the cap (#149 boundary)', async () => {
    // Pins the comparison direction: `>` not `>=`. First chunk is exactly
    // MAX_SSE_BUFFER_CHARS chars with no terminator (must be held, not rejected);
    // the second chunk completes the frame, which must parse and yield.
    const frame = 'data: "' + 'x'.repeat(MAX_SSE_BUFFER_CHARS - 8) + '"'
    expect(frame.length).toBe(MAX_SSE_BUFFER_CHARS)
    const events = await collect(makeReader([enc.encode(frame), enc.encode('\n\n')]))
    expect(events).toHaveLength(1)
  })

  it('throws when the frame count exceeds the cap (#186)', async () => {
    // Endless *valid* frames never trip the byte cap (each drains the buffer),
    // so frame count is bounded separately. Small maxFrames override keeps the
    // fixture tiny; production default is MAX_SSE_FRAMES.
    const oneFrame = `data: ${JSON.stringify({ type: 'lesson_start', lessonNumber: 1 })}\n\n`
    const chunks = Array.from({ length: 6 }, () => enc.encode(oneFrame))
    const stream = parseSSEStream(makeReader(chunks), { maxFrames: 5 })
    await expect((async () => {
      for await (const event of stream) void event
    })()).rejects.toThrow(/frame count/)
  })

  it('yields all frames when the count is exactly at the cap (#186 boundary)', async () => {
    const oneFrame = `data: ${JSON.stringify({ type: 'lesson_start', lessonNumber: 1 })}\n\n`
    const chunks = Array.from({ length: 5 }, () => enc.encode(oneFrame))
    const events: CurateSSEEvent[] = []
    for await (const event of parseSSEStream(makeReader(chunks), { maxFrames: 5 })) {
      events.push(event)
    }
    expect(events).toHaveLength(5)
  })

  it('cancels the underlying stream when the consumer exits early (#153)', async () => {
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'lesson_start', lessonNumber: 1 })}\n\n`))
        // Intentionally never closed — only cancel() releases it.
      },
      cancel() {
        cancelled = true
      },
    })
    for await (const event of parseSSEStream(stream.getReader())) {
      void event
      break // early exit → iterator .return() → generator finally → reader.cancel()
    }
    expect(cancelled).toBe(true)
  })
})
