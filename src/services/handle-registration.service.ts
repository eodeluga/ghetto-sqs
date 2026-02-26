import { randomBytes, randomUUID } from 'node:crypto'
import { type ServiceHandleRepositoryInterface } from '@/interfaces/service-handle-repository.interface'
import { type RegisterHandleRequest, type RegisterHandleResponse } from '@/schemas/register-handle.schema'
import { MessageSignatureService } from '@/services/message-signature.service'
import { PrismaServiceHandleRepositoryService } from '@/services/prisma-service-handle-repository.service'

type RegisterHandleInput = RegisterHandleRequest
const DEFAULT_MAX_RECEIVE_COUNT = 5
const DEFAULT_VISIBILITY_TIMEOUT_SECONDS = 30

class HandleRegistrationService {
  constructor(
    private readonly messageSignatureService: MessageSignatureService = new MessageSignatureService(),
    private readonly serviceHandleRepository: ServiceHandleRepositoryInterface = new PrismaServiceHandleRepositoryService()
  ) {}

  async registerHandle(registerHandleInput: RegisterHandleInput): Promise<RegisterHandleResponse> {
    const defaultMaxReceiveCount = registerHandleInput.defaultMaxReceiveCount ?? DEFAULT_MAX_RECEIVE_COUNT
    const defaultVisibilityTimeoutSeconds = registerHandleInput.defaultVisibilityTimeoutSeconds
      ?? DEFAULT_VISIBILITY_TIMEOUT_SECONDS
    const signingKey = randomBytes(32).toString('hex')
    const signingKeyHash = this.messageSignatureService.createSigningKeyHash(signingKey)
    const userUuid = randomUUID()

    await this.serviceHandleRepository.createServiceHandle({
      defaultMaxReceiveCount,
      defaultVisibilityTimeoutSeconds,
      label: registerHandleInput.label,
      signingKey,
      signingKeyHash,
      userUuid,
    })

    return {
      defaultMaxReceiveCount,
      defaultVisibilityTimeoutSeconds,
      signingKey,
      userUuid,
    }
  }
}

export { HandleRegistrationService }
