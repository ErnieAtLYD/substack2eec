// Slices `s` to at most `max` UTF-16 code units; never returns a string ending
// in a lone high surrogate. Mid-string lone surrogates pass through unchanged —
// this function fixes its own truncation, not the caller's data.
//
// Not grapheme-aware: a multi-codepoint emoji ZWJ sequence cut mid-sequence may
// produce a different glyph (but always valid UTF-16). For LLM-input capping
// that's the right trade-off — tokenizers see code points, not user-perceived
// characters. Do NOT swap in Intl.Segmenter: it OOMs on strings >40K chars
// (jonschlinkert/intl-segmenter), uncomfortably close to MAX_BODY_CHARS.
export function safeSlice(s: string, max: number): string {
  if (max < 0) throw new RangeError(`safeSlice: max must be >= 0, got ${max}`)
  if (max === 0 || s.length === 0) return ''
  if (s.length <= max) return s
  const lastCharCode = s.charCodeAt(max - 1)
  const isHighSurrogate = lastCharCode >= 0xD800 && lastCharCode <= 0xDBFF
  return s.slice(0, isHighSurrogate ? max - 1 : max)
}
