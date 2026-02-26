import { type FastifyInstance } from 'fastify'
import { type Environment } from '@/config/environment'
import '@/interfaces/fastify-authenticated-request.interface'
import { registerHandleRouteGroup } from '@/route-groups/handle.route-group'
import { registerQueueRouteGroup } from '@/route-groups/queue.route-group'
import { registerSystemRouteGroup } from '@/route-groups/system.route-group'
import { HandleRegistrationService } from '@/services/handle-registration.service'
import { MessageSignatureService } from '@/services/message-signature.service'
import { PrismaQueueMessageRepositoryService } from '@/services/prisma-queue-message-repository.service'
import { PrismaServiceHandleRepositoryService } from '@/services/prisma-service-handle-repository.service'
import { PrismaClientService } from '@/services/prisma-client.service'
import { QueueMessageService } from '@/services/queue-message.service'
import { SignedRequestAuthService } from '@/services/signed-request-auth.service'
import { SystemHealthService } from '@/services/system-health.service'

interface RouteDependencies {
  handleRegistrationService: HandleRegistrationService
  queueMessageService: QueueMessageService
  signedRequestAuthService: SignedRequestAuthService
  systemHealthService: SystemHealthService
}

const createRouteDependencies = (environment: Environment): RouteDependencies => {
  const messageSignatureService = new MessageSignatureService()
  const prismaClientService = new PrismaClientService()
  const queueMessageRepository = new PrismaQueueMessageRepositoryService(prismaClientService)
  const serviceHandleRepository = new PrismaServiceHandleRepositoryService(prismaClientService)

  return {
    handleRegistrationService: new HandleRegistrationService(messageSignatureService, serviceHandleRepository),
    queueMessageService: new QueueMessageService(messageSignatureService, queueMessageRepository),
    signedRequestAuthService: new SignedRequestAuthService(
      environment,
      messageSignatureService,
      serviceHandleRepository
    ),
    systemHealthService: new SystemHealthService(),
  }
}

const registerRoutes = (
  fastify: FastifyInstance,
  environment: Environment,
  routeDependencies: RouteDependencies = createRouteDependencies(environment)
): void => {
  registerSystemRouteGroup(fastify, routeDependencies.systemHealthService)
  registerHandleRouteGroup(fastify, routeDependencies.handleRegistrationService)
  registerQueueRouteGroup(fastify, routeDependencies.queueMessageService, routeDependencies.signedRequestAuthService)
}

export { createRouteDependencies, registerRoutes, type RouteDependencies }
