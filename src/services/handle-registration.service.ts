import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { type RegisterHandleRequest, type RegisterHandleResponse } from '@/schemas/register-handle.schema'

class HandleRegistrationService {
  registerHandle(registerHandleRequest: RegisterHandleRequest): RegisterHandleResponse {
    const rawSigningKey = randomBytes(32).toString('hex')
    const signingKeyHash = createHash('sha256').update(rawSigningKey).digest('hex')
    const userUuid = randomUUID()
    void signingKeyHash
    void registerHandleRequest

    return {
      signingKey: rawSigningKey,
      userUuid,
    }
  }
}

export { HandleRegistrationService }
