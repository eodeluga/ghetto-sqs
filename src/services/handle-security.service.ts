import { randomBytes } from 'node:crypto'
import { ValidationError } from '@/errors'
import { type RequestSecurityRepositoryInterface } from '@/interfaces/request-security-repository.interface'
import { type ServiceHandleRepositoryInterface } from '@/interfaces/service-handle-repository.interface'
import { type RevokeHandleResponse } from '@/schemas/revoke-handle.schema'
import { type RotateSigningKeyResponse } from '@/schemas/rotate-signing-key.schema'
import { PrismaRequestSecurityRepositoryService } from '@/services/prisma-request-security-repository.service'
import { PrismaServiceHandleRepositoryService } from '@/services/prisma-service-handle-repository.service'
import { SigningKeyCryptoService } from '@/services/signing-key-crypto.service'

class HandleSecurityService {
  constructor(
    private readonly requestSecurityRepository: RequestSecurityRepositoryInterface = new PrismaRequestSecurityRepositoryService(),
    private readonly serviceHandleRepository: ServiceHandleRepositoryInterface = new PrismaServiceHandleRepositoryService(),
    private readonly signingKeyCryptoService: SigningKeyCryptoService = new SigningKeyCryptoService()
  ) {}

  async revokeHandle(serviceUserUuid: string): Promise<RevokeHandleResponse> {
    const revokedAt = await this.serviceHandleRepository.revokeServiceHandle(serviceUserUuid)

    if (revokedAt === null) {
      throw new ValidationError('Service handle is already revoked', undefined, ['headers', 'x-gsqs-user-uuid'])
    }

    await this.requestSecurityRepository.createAuditEvent({
      action: 'service_handle_revoked',
      actorServiceUserUuid: serviceUserUuid,
      targetId: serviceUserUuid,
      targetType: 'service_handle',
    })

    return {
      revoked: true,
      revokedAt: revokedAt.toISOString(),
    }
  }

  async rotateSigningKey(serviceUserUuid: string): Promise<RotateSigningKeyResponse> {
    const nextSigningKey = randomBytes(32).toString('hex')
    const encryptedSigningKey = this.signingKeyCryptoService.encryptSigningKey(nextSigningKey)
    const rotatedSigningKeyRecord = await this.serviceHandleRepository.rotateServiceSigningKey({
      encryptedSigningKey,
      serviceUserUuid,
    })

    await this.requestSecurityRepository.createAuditEvent({
      action: 'service_signing_key_rotated',
      actorServiceUserUuid: serviceUserUuid,
      details: {
        keyVersion: rotatedSigningKeyRecord.keyVersion,
      },
      targetId: serviceUserUuid,
      targetType: 'service_handle',
    })

    return {
      keyVersion: rotatedSigningKeyRecord.keyVersion,
      signingKey: nextSigningKey,
    }
  }
}

export { HandleSecurityService }
