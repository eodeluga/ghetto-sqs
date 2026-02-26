import { z } from 'zod'

const queueNameSchema = z.string().max(80).min(1).regex(/^[A-Za-z0-9._-]+$/)

const receiveMessagesPathParamsSchema = z.object({
  queueName: queueNameSchema,
})

const receiveMessagesQuerySchema = z.object({
  maxMessages: z.coerce.number().int().max(10).min(1).default(1),
  visibilityTimeoutSeconds: z.coerce.number().int().max(43200).min(0).optional(),
})

const receivedMessageSchema = z.object({
  body: z.unknown(),
  messageGroupId: z.string().max(128).min(1).optional(),
  messageId: z.string().min(1),
  queueName: queueNameSchema,
  receiptHandle: z.string().min(1),
  receiveCount: z.number().int().min(1),
  visibleAt: z.string().datetime(),
})

const receiveMessagesResponseSchema = z.object({
  messages: z.array(receivedMessageSchema),
})

type ReceiveMessagesPathParams = z.infer<typeof receiveMessagesPathParamsSchema>
type ReceiveMessagesQuery = z.infer<typeof receiveMessagesQuerySchema>
type ReceiveMessagesResponse = z.infer<typeof receiveMessagesResponseSchema>

export {
  receiveMessagesPathParamsSchema,
  receiveMessagesQuerySchema,
  receiveMessagesResponseSchema,
  type ReceiveMessagesPathParams,
  type ReceiveMessagesQuery,
  type ReceiveMessagesResponse,
}
