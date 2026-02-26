import { z } from 'zod'

const changeMessageVisibilityPathParamsSchema = z.object({
  messageId: z.string().min(1),
  queueName: z.string().max(80).min(1).regex(/^[A-Za-z0-9_-]+$/),
})

const changeMessageVisibilityRequestSchema = z.object({
  receiptHandle: z.string().min(1),
  visibilityTimeoutSeconds: z.number().int().max(43200).min(0),
})

const changeMessageVisibilityResponseSchema = z.object({
  messageId: z.string().min(1),
  visibleAt: z.string().datetime(),
})

type ChangeMessageVisibilityPathParams = z.infer<typeof changeMessageVisibilityPathParamsSchema>
type ChangeMessageVisibilityRequest = z.infer<typeof changeMessageVisibilityRequestSchema>
type ChangeMessageVisibilityResponse = z.infer<typeof changeMessageVisibilityResponseSchema>

export {
  changeMessageVisibilityPathParamsSchema,
  changeMessageVisibilityRequestSchema,
  changeMessageVisibilityResponseSchema,
  type ChangeMessageVisibilityPathParams,
  type ChangeMessageVisibilityRequest,
  type ChangeMessageVisibilityResponse,
}
