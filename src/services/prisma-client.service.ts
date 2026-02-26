import { PrismaClient } from '@prisma/client'

class PrismaClientService {
  constructor(private readonly prismaClient: PrismaClient = new PrismaClient()) {}

  disconnect(): Promise<void> {
    return this.prismaClient.$disconnect()
  }

  getClient(): PrismaClient {
    return this.prismaClient
  }

  async ping(): Promise<void> {
    await this.prismaClient.$runCommandRaw({
      ping: 1,
    })
  }
}

export { PrismaClientService }
