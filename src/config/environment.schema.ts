import { z } from 'zod'

const environmentSchema = z.object({
  DATABASE_URL: z.string().min(1).default('mongodb://localhost:27017/ghetto_sqs'),
  HOST: z.string().min(1).default('0.0.0.0'),
  LOG_LEVEL: z.enum(['debug', 'error', 'fatal', 'info', 'trace', 'warn']).default('info'),
  PORT: z.coerce.number().int().positive().default(3000),
  SIGNATURE_TOLERANCE_SECONDS: z.coerce.number().int().max(3600).min(1).default(300),
})

type Environment = z.infer<typeof environmentSchema>

export { environmentSchema, type Environment }
