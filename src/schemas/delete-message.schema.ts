import { z } from 'zod'

const deleteMessagePathParamsSchema = z.object({
  messageId: z.string().min(1),
  queueName: z.string().max(80).min(1).regex(/^[A-Za-z0-9_-]+$/),
})

const deleteMessageRequestSchema = z.object({
  receiptHandle: z.string().min(1),
})

const deleteMessageResponseSchema = z.object({
  deleted: z.literal(true),
  messageId: z.string().min(1),
})

type DeleteMessagePathParams = z.infer<typeof deleteMessagePathParamsSchema>
type DeleteMessageRequest = z.infer<typeof deleteMessageRequestSchema>
type DeleteMessageResponse = z.infer<typeof deleteMessageResponseSchema>

export {
  deleteMessagePathParamsSchema,
  deleteMessageRequestSchema,
  deleteMessageResponseSchema,
  type DeleteMessagePathParams,
  type DeleteMessageRequest,
  type DeleteMessageResponse,
}
