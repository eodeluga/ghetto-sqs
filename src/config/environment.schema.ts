import { z } from 'zod'

const environmentSchema = z.object({
  ALLOWLISTED_SERVICE_UUIDS: z.string().default(''),
  DATABASE_URL: z.string().min(1).default('mongodb://localhost:27017/ghetto_sqs'),
  HOST: z.string().min(1).default('0.0.0.0'),
  LOG_LEVEL: z.enum(['debug', 'error', 'fatal', 'info', 'trace', 'warn']).default('info'),
  MAX_VISIBILITY_EXTENSIONS: z.coerce.number().int().max(10_000).min(1).default(20),
  PORT: z.coerce.number().int().positive().default(3000),
  POISON_MESSAGE_RECEIVE_THRESHOLD: z.coerce.number().int().max(10_000).min(1).default(50),
  QUEUE_MESSAGE_RETENTION_SECONDS: z.coerce.number().int().max(2_592_000).min(60).default(345_600),
  REQUEST_RATE_LIMIT_BAN_AFTER_VIOLATIONS: z.coerce.number().int().max(100).min(1).default(5),
  REQUEST_RATE_LIMIT_BAN_SECONDS: z.coerce.number().int().max(86_400).min(1).default(300),
  REQUEST_RATE_LIMIT_MAX_PER_WINDOW: z.coerce.number().int().max(100_000).min(1).default(120),
  REQUEST_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().max(86_400).min(1).default(60),
  SIGNATURE_NONCE_TTL_SECONDS: z.coerce.number().int().max(3600).min(1).default(300),
  SIGNATURE_TOLERANCE_SECONDS: z.coerce.number().int().max(3600).min(1).default(300),
  SIGNING_KEY_MASTER_KEY: z.string().regex(/^[A-Fa-f0-9]{64}$/).default(
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  ),
})

type Environment = z.infer<typeof environmentSchema>

export { environmentSchema, type Environment }
