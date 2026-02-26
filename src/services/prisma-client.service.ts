import { PrismaClient } from '@prisma/client'

class PrismaClientService {
  constructor(private readonly prismaClient: PrismaClient = new PrismaClient()) {}

  getClient(): PrismaClient {
    return this.prismaClient
  }
}

export { PrismaClientService }
