import 'server-only'

// Vercel's runtime log table truncates Error.toString() at ~30 chars, so
// `console.error('[x] error:', err)` shows `Error: ...` and nothing else.
// Emit a flat JSON record instead so the cause is visible without expanding
// the row. Anthropic SDK errors expose .status; duck-type to avoid an SDK
// import at every call site.
export function buildErrorDetail(err: unknown): Record<string, unknown> {
  const detail: Record<string, unknown> =
    err instanceof Error
      ? { name: err.name, message: err.message }
      : { value: String(err) }
  if (err && typeof err === 'object' && 'status' in err) {
    detail.status = (err as { status?: unknown }).status
  }
  return detail
}

export function logError(prefix: string, err: unknown): void {
  let serialized: string
  try {
    serialized = JSON.stringify(buildErrorDetail(err))
  } catch {
    // Defense in depth: a circular ref in detail would otherwise throw inside
    // a catch block and bubble unhandled. Falls back to name+message only.
    serialized = JSON.stringify({
      name: err instanceof Error ? err.name : 'Unknown',
      message: err instanceof Error ? err.message : String(err),
    })
  }
  console.error(prefix, serialized)
}
