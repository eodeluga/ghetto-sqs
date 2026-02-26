import { randomBytes, randomUUID } from 'node:crypto'
import { type ServiceHandleRepositoryInterface } from '@/interfaces/service-handle-repository.interface'
import { type RegisterHandleRequest, type RegisterHandleResponse } from '@/schemas/register-handle.schema'
import { MessageSignatureService } from '@/services/message-signature.service'
import { PrismaServiceHandleRepositoryService } from '@/services/prisma-service-handle-repository.service'

type RegisterHandleInput = RegisterHandleRequest

class HandleRegistrationService {
  constructor(
    private readonly messageSignatureService: MessageSignatureService = new MessageSignatureService(),
    private readonly serviceHandleRepository: ServiceHandleRepositoryInterface = new PrismaServiceHandleRepositoryService()
  ) {}

  async registerHandle(registerHandleInput: RegisterHandleInput): Promise<RegisterHandleResponse> {
    const signingKey = randomBytes(32).toString('hex')
    const signingKeyHash = this.messageSignatureService.createSigningKeyHash(signingKey)
    const userUuid = randomUUID()

    await this.serviceHandleRepository.createServiceHandle({
      label: registerHandleInput.label,
      signingKey,
      signingKeyHash,
      userUuid,
    })

    return {
      signingKey,
      userUuid,
    }
  }
}

export { HandleRegistrationService }
