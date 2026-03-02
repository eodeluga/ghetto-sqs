import { z } from 'zod'

const environmentSchema = z.object({
  DATABASE_URL: z.string().min(1).default('mongodb://localhost:27017/ghetto_sqs'),
  HOST: z.string().min(1).default('0.0.0.0'),
  LOG_LEVEL: z.enum(['debug', 'error', 'fatal', 'info', 'trace', 'warn']).default('info'),
  MAX_VISIBILITY_EXTENSIONS: z.coerce.number().int().max(10_000).min(1).default(20),
  PORT: z.coerce.number().int().positive().default(3000),
  POISON_MESSAGE_RECEIVE_THRESHOLD: z.coerce.number().int().max(10_000).min(1).default(50),
  QUEUE_MESSAGE_RETENTION_SECONDS: z.coerce.number().int().max(2_592_000).min(60).default(345_600),
})

type Environment = z.infer<typeof environmentSchema>

export { environmentSchema, type Environment }
