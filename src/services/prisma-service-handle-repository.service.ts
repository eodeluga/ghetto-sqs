import { Prisma, type PrismaClient } from '@prisma/client'
import { AlreadyRegisteredError } from '@/errors'
import {
  type CreateServiceHandleInput,
  type RotateServiceSigningKeyInput,
  type ServiceHandleRecord,
  type ServiceHandleRepositoryInterface,
  type ServiceSigningKeyRecord,
} from '@/interfaces/service-handle-repository.interface'
import { PrismaClientService } from '@/services/prisma-client.service'

class PrismaServiceHandleRepositoryService implements ServiceHandleRepositoryInterface {
  private isUniqueLabelViolation(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false
    }

    if (error.code !== 'P2002') {
      return false
    }

    const target = error.meta?.target

    if (!Array.isArray(target)) {
      return false
    }

    return target.includes('label')
  }

  private get prismaClient(): PrismaClient {
    return this.prismaClientService.getClient()
  }

  constructor(private readonly prismaClientService: PrismaClientService = new PrismaClientService()) {}

  async createServiceHandle(createServiceHandleInput: CreateServiceHandleInput): Promise<ServiceHandleRecord> {
    let serviceHandleRecord: ServiceHandleRecord | null = null

    try {
      serviceHandleRecord = await this.prismaClient.serviceHandle.create({
        data: {
          activeKeyVersion: createServiceHandleInput.activeKeyVersion,
          defaultMaxReceiveCount: createServiceHandleInput.defaultMaxReceiveCount,
          defaultVisibilityTimeoutSeconds: createServiceHandleInput.defaultVisibilityTimeoutSeconds,
          label: createServiceHandleInput.label,
          userUuid: createServiceHandleInput.userUuid,
        },
      })
      await this.prismaClient.serviceSigningKey.create({
        data: {
          encryptedSigningKey: createServiceHandleInput.encryptedSigningKey,
          keyVersion: createServiceHandleInput.keyVersion,
          serviceUserUuid: createServiceHandleInput.userUuid,
        },
      })

      return serviceHandleRecord
    } catch (error: unknown) {
      if (this.isUniqueLabelViolation(error)) {
        throw new AlreadyRegisteredError('Service handle label is already registered', undefined, ['body', 'label'])
      }

      if (serviceHandleRecord !== null) {
        await this.prismaClient.serviceHandle.deleteMany({
          where: {
            userUuid: createServiceHandleInput.userUuid,
          },
        })
      }

      throw error
    }
  }

  async getServiceHandleByLabel(label: string): Promise<ServiceHandleRecord | null> {
    return this.prismaClient.serviceHandle.findUnique({
      where: {
        label,
      },
    })
  }

  async getServiceHandleByUserUuid(userUuid: string): Promise<ServiceHandleRecord | null> {
    return this.prismaClient.serviceHandle.findUnique({
      where: {
        userUuid,
      },
    })
  }

  async getUnrevokedSigningKeysByUserUuid(userUuid: string): Promise<ServiceSigningKeyRecord[]> {
    return this.prismaClient.serviceSigningKey.findMany({
      orderBy: {
        keyVersion: 'desc',
      },
      where: {
        revokedAt: null,
        serviceUserUuid: userUuid,
      },
    })
  }

  async revokeServiceHandle(userUuid: string): Promise<Date | null> {
    const revokedAt = new Date()
    const serviceHandleUpdateResult = await this.prismaClient.serviceHandle.updateMany({
      data: {
        revokedAt,
      },
      where: {
        revokedAt: null,
        userUuid,
      },
    })

    if (serviceHandleUpdateResult.count !== 1) {
      return null
    }

    await this.prismaClient.serviceSigningKey.updateMany({
      data: {
        revokedAt,
      },
      where: {
        revokedAt: null,
        serviceUserUuid: userUuid,
      },
    })

    return revokedAt
  }

  async rotateServiceSigningKey(
    rotateServiceSigningKeyInput: RotateServiceSigningKeyInput
  ): Promise<ServiceSigningKeyRecord> {
    const serviceHandleRecord = await this.prismaClient.serviceHandle.findUnique({
      where: {
        userUuid: rotateServiceSigningKeyInput.serviceUserUuid,
      },
    })

    if (serviceHandleRecord === null) {
      throw new Error('Service handle not found for signing key rotation')
    }

    if (serviceHandleRecord.revokedAt !== null) {
      throw new Error('Cannot rotate signing key for revoked service handle')
    }

    const nextKeyVersion = serviceHandleRecord.activeKeyVersion + 1
    const serviceSigningKeyRecord = await this.prismaClient.serviceSigningKey.create({
      data: {
        encryptedSigningKey: rotateServiceSigningKeyInput.encryptedSigningKey,
        keyVersion: nextKeyVersion,
        serviceUserUuid: rotateServiceSigningKeyInput.serviceUserUuid,
      },
    })

    await this.prismaClient.serviceHandle.update({
      data: {
        activeKeyVersion: nextKeyVersion,
      },
      where: {
        userUuid: rotateServiceSigningKeyInput.serviceUserUuid,
      },
    })
    await this.prismaClient.serviceSigningKey.updateMany({
      data: {
        revokedAt: new Date(),
      },
      where: {
        keyVersion: {
          not: nextKeyVersion,
        },
        revokedAt: null,
        serviceUserUuid: rotateServiceSigningKeyInput.serviceUserUuid,
      },
    })

    return serviceSigningKeyRecord
  }
}

export { PrismaServiceHandleRepositoryService }
