import { z } from 'zod'

const registerHandleRequestSchema = z.object({
  label: z.string().max(100).min(3),
})

const registerHandleResponseSchema = z.object({
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
