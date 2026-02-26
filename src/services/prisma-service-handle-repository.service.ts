import { Prisma, type PrismaClient } from '@prisma/client'
import { AlreadyRegisteredError } from '@/errors'
import {
  type CreateServiceHandleInput,
  type ServiceHandleRecord,
  type ServiceHandleRepositoryInterface,
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
    try {
      return await this.prismaClient.serviceHandle.create({
        data: {
          defaultMaxReceiveCount: createServiceHandleInput.defaultMaxReceiveCount,
          defaultVisibilityTimeoutSeconds: createServiceHandleInput.defaultVisibilityTimeoutSeconds,
          label: createServiceHandleInput.label,
          signingKey: createServiceHandleInput.signingKey,
          signingKeyHash: createServiceHandleInput.signingKeyHash,
          userUuid: createServiceHandleInput.userUuid,
        },
      })
    } catch (error: unknown) {
      if (this.isUniqueLabelViolation(error)) {
        throw new AlreadyRegisteredError('Service handle label is already registered', undefined, ['body', 'label'])
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
}

export { PrismaServiceHandleRepositoryService }
