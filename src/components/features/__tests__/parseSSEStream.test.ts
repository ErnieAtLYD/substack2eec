import { describe, it, expect } from 'vitest'
import { parseSSEStream } from '../ReviewForm'
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
})
