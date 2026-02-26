import { z } from 'zod'

const receiveMessagesPathParamsSchema = z.object({
  queueName: z.string().max(80).min(1).regex(/^[A-Za-z0-9_-]+$/),
})

const receiveMessagesQuerySchema = z.object({
  maxMessages: z.coerce.number().int().max(10).min(1).default(1),
  visibilityTimeoutSeconds: z.coerce.number().int().max(43200).min(0).default(30),
})

const receivedMessageSchema = z.object({
  body: z.unknown(),
  messageId: z.string().min(1),
  queueName: z.string().max(80).min(1),
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
