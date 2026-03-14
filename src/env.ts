import 'server-only'
import { z } from 'zod'

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
})

// Lazily validated — throws at first call, not at import/build time
let _env: z.infer<typeof envSchema> | null = null

export function getEnv(): z.infer<typeof envSchema> {
  if (!_env) _env = envSchema.parse(process.env)
  return _env
}
