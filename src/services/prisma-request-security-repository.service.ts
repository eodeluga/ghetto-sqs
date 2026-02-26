import { Prisma, type PrismaClient } from '@prisma/client'
import {
  type CreateAuditEventInput,
  type RequestSecurityRepositoryInterface,
  type StoreSignedRequestNonceInput,
} from '@/interfaces/request-security-repository.interface'
import { PrismaClientService } from '@/services/prisma-client.service'

class PrismaRequestSecurityRepositoryService implements RequestSecurityRepositoryInterface {
  private isDuplicateNonceError(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false
    }

    return error.code === 'P2002'
  }

  private get prismaClient(): PrismaClient {
    return this.prismaClientService.getClient()
  }

  constructor(private readonly prismaClientService: PrismaClientService = new PrismaClientService()) {}

  async createAuditEvent(createAuditEventInput: CreateAuditEventInput): Promise<void> {
    await this.prismaClient.auditEvent.create({
      data: {
        action: createAuditEventInput.action,
        actorServiceUserUuid: createAuditEventInput.actorServiceUserUuid ?? null,
        details: (createAuditEventInput.details ?? undefined) as Prisma.InputJsonValue | undefined,
        targetId: createAuditEventInput.targetId,
        targetType: createAuditEventInput.targetType,
      },
    })
  }

  async deleteExpiredSignedRequestNonces(expiredAtOrBefore: Date): Promise<number> {
    const deleteResult = await this.prismaClient.signedRequestNonce.deleteMany({
      where: {
        expiresAt: {
          lte: expiredAtOrBefore,
        },
      },
    })

    return deleteResult.count
  }

  async storeSignedRequestNonce(storeSignedRequestNonceInput: StoreSignedRequestNonceInput): Promise<boolean> {
    try {
      await this.prismaClient.signedRequestNonce.create({
        data: {
          expiresAt: storeSignedRequestNonceInput.expiresAt,
          nonce: storeSignedRequestNonceInput.nonce,
          serviceUserUuid: storeSignedRequestNonceInput.serviceUserUuid,
        },
      })

      return true
    } catch (error: unknown) {
      if (this.isDuplicateNonceError(error)) {
        return false
      }

      throw error
    }
  }
}

export { PrismaRequestSecurityRepositoryService }
