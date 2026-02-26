import { z } from 'zod'

const systemHealthResponseSchema = z.object({
  status: z.literal('ok'),
})

type SystemHealthResponse = z.infer<typeof systemHealthResponseSchema>

export { systemHealthResponseSchema, type SystemHealthResponse }
