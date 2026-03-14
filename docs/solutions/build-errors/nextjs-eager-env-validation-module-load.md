---
title: "Next.js Build-Time Environment Validation Failure"
description: "next build fails with Zod validation error when env vars are parsed at module load time. Env vars from .env.local are not available during static analysis. Fix: lazy getEnv() function."
tags:
  - environment-variables
  - zod
  - next.js
  - build
  - server-only
category: build-errors
severity: high
framework: next.js-15-typescript
---

# Next.js Build-Time Environment Validation Failure

## Symptom

`next build` fails with a Zod error even though the env var is correctly set in `.env.local` and works at runtime:

```
Error: [
  {
    "code": "too_small",
    "message": "ANTHROPIC_API_KEY is required"
  }
]
    at instantiateModule (.next/server/chunks/[turbopack]_runtime.js:740:9)
    ...
> Build error occurred
Error: Failed to collect page data for /api/curate
```

## Root Cause

During `next build`, Next.js statically analyzes all route modules by importing them before env vars from `.env.local` are injected into `process.env`. Any `schema.parse(process.env)` call at module scope executes synchronously during this import — Zod throws, crashing the build.

The key distinction: `.env.local` is available at **runtime** (dev server, production server) but **not during the build's static analysis phase**.

## Broken Pattern

```typescript
// src/env.ts — BAD
import 'server-only'
import { z } from 'zod'

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
})

export const env = envSchema.parse(process.env)  // ← runs at import time during build
```

## Fix

Make validation lazy — defer until first call at runtime:

```typescript
// src/env.ts — GOOD
import 'server-only'
import { z } from 'zod'

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
})

let _env: z.infer<typeof envSchema> | null = null

export function getEnv(): z.infer<typeof envSchema> {
  if (!_env) _env = envSchema.parse(process.env)
  return _env
}
```

Also required: any file importing `env` must switch to `getEnv()` and call it inside functions, not at module scope:

```typescript
// src/lib/ai.ts — GOOD
import { getEnv } from '@/env'

// BAD: const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
// Lazy client initialization — called at request time, not module load
let _client: Anthropic | null = null
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: getEnv().ANTHROPIC_API_KEY })
  return _client
}
```

## Prevention

- **Never** call `schema.parse(process.env)` at module level in Next.js
- **Always** wrap env validation in a function that returns a cached result
- **Never** export a raw validated-env object — export a getter function instead
- Any module-level code that depends on env vars (e.g. instantiating API clients) must be wrapped in a lazy initializer

## Other Patterns That Cause the Same Problem

```typescript
// Also BAD — top-level client instantiation
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// Also BAD — any side-effect at module scope that reads process.env
if (!process.env.ANTHROPIC_API_KEY) throw new Error('...')
```

## Detecting Early

Test your build without `.env.local` in CI:

```bash
# Should succeed if env validation is properly lazy
mv .env.local .env.local.bak && npm run build && mv .env.local.bak .env.local
```

## References

- [Next.js Environment Variables docs](https://nextjs.org/docs/pages/guides/environment-variables)
- `src/env.ts` in this project — lazy implementation
- `src/lib/ai.ts` — lazy client initialization pattern
