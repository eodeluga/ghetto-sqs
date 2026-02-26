import { z } from 'zod'

const enqueueMessagePathParamsSchema = z.object({
  queueName: z.string().max(80).min(1).regex(/^[A-Za-z0-9_-]+$/),
})

const enqueueMessageRequestSchema = z.object({
  body: z.unknown(),
  delaySeconds: z.number().int().max(900).min(0).default(0),
})

const enqueueMessageResponseSchema = z.object({
  messageId: z.string().min(1),
  queueName: z.string().max(80).min(1),
  visibleAt: z.string().datetime(),
})

type EnqueueMessagePathParams = z.infer<typeof enqueueMessagePathParamsSchema>
type EnqueueMessageRequest = z.infer<typeof enqueueMessageRequestSchema>
type EnqueueMessageResponse = z.infer<typeof enqueueMessageResponseSchema>

export {
  enqueueMessagePathParamsSchema,
  enqueueMessageRequestSchema,
  enqueueMessageResponseSchema,
  type EnqueueMessagePathParams,
  type EnqueueMessageRequest,
  type EnqueueMessageResponse,
}
