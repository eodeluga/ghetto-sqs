import { z } from 'zod'

const rotateSigningKeyResponseSchema = z.object({
  keyVersion: z.number().int().min(1),
  signingKey: z.string().min(1),
})

type RotateSigningKeyResponse = z.infer<typeof rotateSigningKeyResponseSchema>

export { rotateSigningKeyResponseSchema, type RotateSigningKeyResponse }
