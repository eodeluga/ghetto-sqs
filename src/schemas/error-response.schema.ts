import { z } from 'zod'

const errorResponseSchema = z.object({
  code: z.string().min(1),
  details: z.unknown().optional(),
  message: z.string().min(1),
  requestId: z.string().min(1),
})

type ErrorResponse = z.infer<typeof errorResponseSchema>

export { errorResponseSchema, type ErrorResponse }
