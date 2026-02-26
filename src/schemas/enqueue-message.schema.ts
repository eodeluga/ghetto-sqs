import { z } from 'zod'

const queueNameSchema = z.string().max(80).min(1).regex(/^[A-Za-z0-9._-]+$/)

const enqueueMessagePathParamsSchema = z.object({
  queueName: queueNameSchema,
})

const enqueueMessageRequestSchema = z.object({
  body: z.unknown(),
  deadLetterQueueName: queueNameSchema.optional(),
  delaySeconds: z.number().int().max(900).min(0).default(0),
  maxReceiveCount: z.number().int().max(1000).min(1).optional(),
  messageDeduplicationId: z.string().max(128).min(1).optional(),
  messageGroupId: z.string().max(128).min(1).optional(),
})

const enqueueMessageResponseSchema = z.object({
  deduplicated: z.boolean(),
  messageId: z.string().min(1),
  queueName: queueNameSchema,
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
