import { z } from 'zod'

const serviceAuthHeadersSchema = z.object({
  'x-gsqs-signature': z.string().min(1).regex(/^[A-Fa-f0-9]+$/),
  'x-gsqs-timestamp': z.string().regex(/^\d{10,16}$/),
  'x-gsqs-user-uuid': z.string().uuid(),
})

type ServiceAuthHeaders = z.infer<typeof serviceAuthHeadersSchema>

export { serviceAuthHeadersSchema, type ServiceAuthHeaders }
