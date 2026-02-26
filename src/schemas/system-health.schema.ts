import { z } from 'zod'

const systemHealthResponseSchema = z.object({
  status: z.literal('ok'),
})
const systemReadinessResponseSchema = z.object({
  status: z.enum(['not_ready', 'ready']),
})

type SystemHealthResponse = z.infer<typeof systemHealthResponseSchema>
type SystemReadinessResponse = z.infer<typeof systemReadinessResponseSchema>

export {
  systemHealthResponseSchema,
  systemReadinessResponseSchema,
  type SystemHealthResponse,
  type SystemReadinessResponse,
}
