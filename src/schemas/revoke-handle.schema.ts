import { z } from 'zod'

const revokeHandleResponseSchema = z.object({
  revoked: z.literal(true),
  revokedAt: z.string().datetime(),
})

type RevokeHandleResponse = z.infer<typeof revokeHandleResponseSchema>

export { revokeHandleResponseSchema, type RevokeHandleResponse }
