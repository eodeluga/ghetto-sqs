import { randomBytes, randomUUID } from 'node:crypto'
import { AlreadyRegisteredError } from '@/errors'
import { type RequestSecurityRepositoryInterface } from '@/interfaces/request-security-repository.interface'
import { type ServiceHandleRepositoryInterface } from '@/interfaces/service-handle-repository.interface'
import { type RegisterHandleRequest, type RegisterHandleResponse } from '@/schemas/register-handle.schema'
import { PrismaRequestSecurityRepositoryService } from '@/services/prisma-request-security-repository.service'
import { PrismaServiceHandleRepositoryService } from '@/services/prisma-service-handle-repository.service'
import { SigningKeyCryptoService } from '@/services/signing-key-crypto.service'

type RegisterHandleInput = RegisterHandleRequest
const DEFAULT_KEY_VERSION = 1
const DEFAULT_MAX_RECEIVE_COUNT = 5
const DEFAULT_VISIBILITY_TIMEOUT_SECONDS = 30

class HandleRegistrationService {
  private async ensureHandleLabelIsAvailable(label: string): Promise<void> {
    const existingServiceHandle = await this.serviceHandleRepository.getServiceHandleByLabel(label)

    if (existingServiceHandle !== null) {
      throw new AlreadyRegisteredError('Service handle label is already registered', undefined, ['body', 'label'])
    }
  }

  constructor(
    private readonly requestSecurityRepository: RequestSecurityRepositoryInterface = new PrismaRequestSecurityRepositoryService(),
    private readonly serviceHandleRepository: ServiceHandleRepositoryInterface = new PrismaServiceHandleRepositoryService(),
    private readonly signingKeyCryptoService: SigningKeyCryptoService = new SigningKeyCryptoService()
  ) {}

  async registerHandle(registerHandleInput: RegisterHandleInput): Promise<RegisterHandleResponse> {
    await this.ensureHandleLabelIsAvailable(registerHandleInput.label)
    const defaultMaxReceiveCount = registerHandleInput.defaultMaxReceiveCount ?? DEFAULT_MAX_RECEIVE_COUNT
    const defaultVisibilityTimeoutSeconds = registerHandleInput.defaultVisibilityTimeoutSeconds
      ?? DEFAULT_VISIBILITY_TIMEOUT_SECONDS
    const signingKey = randomBytes(32).toString('hex')
    const encryptedSigningKey = this.signingKeyCryptoService.encryptSigningKey(signingKey)
    const userUuid = randomUUID()

    await this.serviceHandleRepository.createServiceHandle({
      activeKeyVersion: DEFAULT_KEY_VERSION,
      defaultMaxReceiveCount,
      defaultVisibilityTimeoutSeconds,
      encryptedSigningKey,
      keyVersion: DEFAULT_KEY_VERSION,
      label: registerHandleInput.label,
      userUuid,
    })
    await this.requestSecurityRepository.createAuditEvent({
      action: 'service_handle_registered',
      actorServiceUserUuid: userUuid,
      details: {
        defaultMaxReceiveCount,
        defaultVisibilityTimeoutSeconds,
        label: registerHandleInput.label,
      },
      targetId: userUuid,
      targetType: 'service_handle',
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
