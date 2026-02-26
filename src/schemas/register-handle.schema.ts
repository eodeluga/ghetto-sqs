import { z } from 'zod'

const registerHandleRequestSchema = z.object({
  defaultMaxReceiveCount: z.number().int().max(1000).min(1).optional(),
  defaultVisibilityTimeoutSeconds: z.number().int().max(43200).min(0).optional(),
  label: z.string().max(100).min(3),
})

const registerHandleResponseSchema = z.object({
  defaultMaxReceiveCount: z.number().int().max(1000).min(1),
  defaultVisibilityTimeoutSeconds: z.number().int().max(43200).min(0),
  signingKey: z.string().min(1),
  userUuid: z.string().uuid(),
})

type RegisterHandleRequest = z.infer<typeof registerHandleRequestSchema>
type RegisterHandleResponse = z.infer<typeof registerHandleResponseSchema>

export {
  registerHandleRequestSchema,
  registerHandleResponseSchema,
  type RegisterHandleRequest,
  type RegisterHandleResponse,
}
