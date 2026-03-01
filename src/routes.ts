import { type FastifyInstance } from 'fastify'
import { type Environment } from '@/config/environment'
import { registerQueueRouteGroup } from '@/route-groups/queue.route-group'
import { registerSystemRouteGroup } from '@/route-groups/system.route-group'
import { MessageSignatureService } from '@/services/message-signature.service'
import { PrismaQueueMessageRepositoryService } from '@/services/prisma-queue-message-repository.service'
import { PrismaClientService } from '@/services/prisma-client.service'
import { QueueMessageService } from '@/services/queue-message.service'
import { SystemHealthService } from '@/services/system-health.service'

interface RouteDependencies {
  queueMessageService: QueueMessageService
  systemHealthService: SystemHealthService
}

interface ServerRouteDependencies extends RouteDependencies {
  prismaClientService: PrismaClientService
}

const createRouteDependencies = (environment: Environment): ServerRouteDependencies => {
  const messageSignatureService = new MessageSignatureService()
  const prismaClientService = new PrismaClientService()
  const queueMessageRepository = new PrismaQueueMessageRepositoryService(prismaClientService)

  return {
    prismaClientService,
    queueMessageService: new QueueMessageService(messageSignatureService, queueMessageRepository, environment),
    systemHealthService: new SystemHealthService(prismaClientService),
  }
}

const registerRoutes = (
  fastify: FastifyInstance,
  environment: Environment,
  routeDependencies: RouteDependencies = createRouteDependencies(environment)
): void => {
  registerSystemRouteGroup(fastify, routeDependencies.systemHealthService)
  registerQueueRouteGroup(fastify, routeDependencies.queueMessageService)
}

export { createRouteDependencies, registerRoutes, type RouteDependencies, type ServerRouteDependencies }
