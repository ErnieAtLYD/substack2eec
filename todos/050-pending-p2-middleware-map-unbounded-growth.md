---
status: pending
priority: p2
issue_id: "050"
tags: [code-review, performance, security, rate-limiting, memory-leak]
dependencies: []
---

# Rate Limiter `store` Map Grows Without Bound — Memory Leak

## Problem Statement

`src/middleware.ts` uses a module-level `Map` that is never pruned. Expired entries are only overwritten when the same key is seen again after expiry. An IP that makes exactly one request and never returns leaves its entry in the Map forever. Under sustained traffic with rotating IPs (e.g. scrapers, distributed load), the map grows without bound.

## Findings

**Location:** `src/middleware.ts:9` and `src/middleware.ts:11-24`

```typescript
const store = new Map<string, RateLimitEntry>()  // never pruned

function isRateLimited(...): boolean {
  // Only overwrites entry when same key is seen again after expiry
  // An IP that requests once and leaves → entry stays forever
}
```

**Impact at scale:**
- Low traffic (MVP): negligible — hundreds of entries, ~KBs
- Viral burst (10K unique IPs/day × 3 routes): ~30K entries, ~3-4MB — still acceptable
- Sustained abuse (50K+ unique IPs with rotating spoofed IPs): hundreds of thousands of entries, potential OOM on memory-constrained containers

Also: since Next.js middleware on Vercel runs across multiple instances, the in-memory store provides no coordination between instances. This is documented in the comment but means the effective rate limit is `N * config.limit` per window where N is the number of active instances.

## Proposed Solutions

### Option A: Periodic setInterval cleanup (Recommended for MVP)
```typescript
// Prune expired entries every 60 seconds
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (now >= entry.resetAt) store.delete(key)
  }
}, 60_000)
```
Place immediately after `store` declaration. O(n) over current entries once/minute.

### Option B: Prune inside `isRateLimited` on each call
```typescript
function pruneExpired(now: number): void {
  for (const [key, entry] of store) {
    if (now >= entry.resetAt) store.delete(key)
  }
}

function isRateLimited(...): boolean {
  const now = Date.now()
  pruneExpired(now)
  // ...
}
```
Keeps the map bounded but adds O(n) overhead on every request.

### Option C: Add a size cap with eviction on overflow
```typescript
if (store.size > 10_000) {
  const now = Date.now()
  for (const [k, v] of store) {
    if (now >= v.resetAt) store.delete(k)
  }
}
```
Only runs cleanup when the map is large; amortizes cost.

## Recommended Action

Option A (setInterval). Clean, simple, and won't affect request latency.

## Technical Details

**Affected file:** `src/middleware.ts`

## Acceptance Criteria

- [ ] Expired entries are eventually removed from `store`
- [ ] Map size is bounded under sustained traffic with rotating IPs

## Work Log

- 2026-03-29: Found during performance and TypeScript review of batch fixes (round 2)
