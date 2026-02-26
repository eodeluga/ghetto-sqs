import { type PrismaClient } from '@prisma/client'
import {
  type CreateServiceHandleInput,
  type ServiceHandleRecord,
  type ServiceHandleRepositoryInterface,
} from '@/interfaces/service-handle-repository.interface'
import { PrismaClientService } from '@/services/prisma-client.service'

class PrismaServiceHandleRepositoryService implements ServiceHandleRepositoryInterface {
  private get prismaClient(): PrismaClient {
    return this.prismaClientService.getClient()
  }

  constructor(private readonly prismaClientService: PrismaClientService = new PrismaClientService()) {}

  async createServiceHandle(createServiceHandleInput: CreateServiceHandleInput): Promise<ServiceHandleRecord> {
    return this.prismaClient.serviceHandle.create({
      data: {
        defaultMaxReceiveCount: createServiceHandleInput.defaultMaxReceiveCount,
        defaultVisibilityTimeoutSeconds: createServiceHandleInput.defaultVisibilityTimeoutSeconds,
        label: createServiceHandleInput.label,
        signingKey: createServiceHandleInput.signingKey,
        signingKeyHash: createServiceHandleInput.signingKeyHash,
        userUuid: createServiceHandleInput.userUuid,
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
