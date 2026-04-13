import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(
  pathname: string,
  headers: Record<string, string> = {},
  ip?: string
): NextRequest {
  const req = new NextRequest(`http://localhost${pathname}`, { headers })
  // NextRequest does not expose `.ip` as a constructor option; set it via defineProperty
  // to simulate Vercel's edge-injected IP in tests.
  if (ip !== undefined) {
    Object.defineProperty(req, 'ip', { value: ip, configurable: true })
  }
  return req
}

// The rate-limit for /api/curate is 5 requests per minute.
const CURATE_LIMIT = 5

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('middleware — IP resolution for rate limiting', () => {
  // Each test gets a fresh module so the in-memory `store` Map starts empty.
  let middlewareFn: (req: NextRequest) => Response

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('../middleware')
    middlewareFn = mod.middleware as (req: NextRequest) => Response
  })

  // -------------------------------------------------------------------------
  // BUG REPRODUCTION: proves the current code is vulnerable
  // -------------------------------------------------------------------------
  describe('XFF spoofing bypass (bug)', () => {
    it('should rate-limit a 6th request from the same real IP even when x-forwarded-for changes each time', async () => {
      const realIp = '1.2.3.4'

      // Exhaust the bucket using the real IP via x-vercel-forwarded-for,
      // rotating a different spoofed X-Forwarded-For on every request.
      for (let i = 0; i < CURATE_LIMIT; i++) {
        const req = makeRequest('/api/curate', {
          'x-vercel-forwarded-for': realIp,
          'x-forwarded-for': `10.0.0.${i}`, // different XFF each time
        })
        const res = middlewareFn(req)
        expect(res.status, `request ${i + 1} should not be rate-limited`).not.toBe(429)
      }

      // 6th request: same real IP, yet another spoofed XFF.
      // With the bug:  rate-limiter keys on `10.0.0.99` → fresh bucket → 200 (bypass!)
      // With the fix:  rate-limiter keys on `1.2.3.4`   → bucket full  → 429 (correct)
      const bypassAttempt = makeRequest('/api/curate', {
        'x-vercel-forwarded-for': realIp,
        'x-forwarded-for': '10.0.0.99',
      })
      const res = middlewareFn(bypassAttempt)
      expect(res.status).toBe(429)
    })

    it('should rate-limit the 6th request when only x-forwarded-for is rotated (no x-vercel-forwarded-for)', async () => {
      // Exhaust the limit with a consistent x-vercel-forwarded-for IP.
      const realIp = '5.6.7.8'

      for (let i = 0; i < CURATE_LIMIT; i++) {
        const req = makeRequest('/api/curate', {
          'x-vercel-forwarded-for': realIp,
        })
        middlewareFn(req)
      }

      // Attacker rotates BOTH headers hoping for a fresh bucket.
      const bypassAttempt = makeRequest('/api/curate', {
        'x-vercel-forwarded-for': realIp,    // same real IP
        'x-forwarded-for': '255.255.255.255', // spoofed
      })
      const res = middlewareFn(bypassAttempt)
      expect(res.status).toBe(429)
    })
  })

  // -------------------------------------------------------------------------
  // Sanity: legitimate requests still work
  // -------------------------------------------------------------------------
  describe('legitimate rate limiting', () => {
    it('allows requests up to the limit', async () => {
      for (let i = 0; i < CURATE_LIMIT; i++) {
        const req = makeRequest('/api/curate', {
          'x-vercel-forwarded-for': '9.9.9.9',
        })
        const res = middlewareFn(req)
        expect(res.status).not.toBe(429)
      }
    })

    it('blocks the request that exceeds the limit', async () => {
      for (let i = 0; i < CURATE_LIMIT; i++) {
        middlewareFn(makeRequest('/api/curate', { 'x-vercel-forwarded-for': '8.8.8.8' }))
      }
      const res = middlewareFn(makeRequest('/api/curate', { 'x-vercel-forwarded-for': '8.8.8.8' }))
      expect(res.status).toBe(429)
    })

    it('treats different real IPs as separate buckets', async () => {
      // Exhaust bucket for IP A
      for (let i = 0; i < CURATE_LIMIT; i++) {
        middlewareFn(makeRequest('/api/curate', { 'x-vercel-forwarded-for': '1.1.1.1' }))
      }
      // IP B should still be allowed
      const res = middlewareFn(makeRequest('/api/curate', { 'x-vercel-forwarded-for': '2.2.2.2' }))
      expect(res.status).not.toBe(429)
    })
  })

  // -------------------------------------------------------------------------
  // request.ip precedence: proves request.ip takes priority over x-vercel-forwarded-for
  // -------------------------------------------------------------------------
  describe('request.ip precedence', () => {
    it('keys on request.ip when present, ignoring x-vercel-forwarded-for', async () => {
      const primaryIp = '7.7.7.7'
      const headerIp = '8.8.8.8' // different — would open a fresh bucket if used as key

      // Exhaust the bucket using request.ip; x-vercel-forwarded-for differs each time
      for (let i = 0; i < CURATE_LIMIT; i++) {
        const req = makeRequest(
          '/api/curate',
          { 'x-vercel-forwarded-for': `${i}.${i}.${i}.${i}` },
          primaryIp
        )
        expect(middlewareFn(req).status, `request ${i + 1} should not be rate-limited`).not.toBe(429)
      }

      // 6th request: same request.ip, fresh x-vercel-forwarded-for — must still be blocked
      const res = middlewareFn(
        makeRequest('/api/curate', { 'x-vercel-forwarded-for': headerIp }, primaryIp)
      )
      expect(res.status).toBe(429)
    })

  })
})
