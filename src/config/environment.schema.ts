import { z } from 'zod'

const environmentSchema = z.object({
  DATABASE_URL: z.string().min(1).default('mongodb://localhost:27017/ghetto_sqs'),
  HOST: z.string().min(1).default('0.0.0.0'),
  LOG_LEVEL: z.enum(['debug', 'error', 'fatal', 'info', 'trace', 'warn']).default('info'),
  PORT: z.coerce.number().int().positive().default(3000),
})

type Environment = z.infer<typeof environmentSchema>

export { environmentSchema, type Environment }
