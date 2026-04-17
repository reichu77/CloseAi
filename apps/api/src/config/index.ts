import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_SECRET: z.string().min(1),

  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(3306),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string().default('closeai'),

  REDIS_URL: z.string().default('redis://localhost:6379'),

  META_VERIFY_TOKEN: z.string(),
  META_APP_SECRET: z.string(),
  META_ACCESS_TOKEN: z.string(),

  ANTHROPIC_API_KEY: z.string().min(1),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌  Invalid environment variables:')
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const config = parsed.data
