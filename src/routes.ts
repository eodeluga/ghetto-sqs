import { type FastifyInstance } from 'fastify'
import { type Environment } from '@/config/environment'
import '@/interfaces/fastify-authenticated-request.interface'
import { registerHandleRouteGroup } from '@/route-groups/handle.route-group'
import { registerQueueRouteGroup } from '@/route-groups/queue.route-group'
import { registerSystemRouteGroup } from '@/route-groups/system.route-group'
import { HandleRegistrationService } from '@/services/handle-registration.service'
import { HandleSecurityService } from '@/services/handle-security.service'
import { MessageSignatureService } from '@/services/message-signature.service'
import { PrismaQueueMessageRepositoryService } from '@/services/prisma-queue-message-repository.service'
import { PrismaRequestSecurityRepositoryService } from '@/services/prisma-request-security-repository.service'
import { PrismaServiceHandleRepositoryService } from '@/services/prisma-service-handle-repository.service'
import { PrismaClientService } from '@/services/prisma-client.service'
import { QueueMessageService } from '@/services/queue-message.service'
import { RequestRateLimiterService } from '@/services/request-rate-limiter.service'
import { SignedRequestAuthService } from '@/services/signed-request-auth.service'
import { SigningKeyCryptoService } from '@/services/signing-key-crypto.service'
import { SystemHealthService } from '@/services/system-health.service'

interface RouteDependencies {
  handleRegistrationService: HandleRegistrationService
  handleSecurityService: HandleSecurityService
  queueMessageService: QueueMessageService
  signedRequestAuthService: SignedRequestAuthService
  systemHealthService: SystemHealthService
}

interface ServerRouteDependencies extends RouteDependencies {
  prismaClientService: PrismaClientService
}

const createRouteDependencies = (environment: Environment): ServerRouteDependencies => {
  const messageSignatureService = new MessageSignatureService()
  const prismaClientService = new PrismaClientService()
  const queueMessageRepository = new PrismaQueueMessageRepositoryService(prismaClientService)
  const requestSecurityRepository = new PrismaRequestSecurityRepositoryService(prismaClientService)
  const requestRateLimiterService = new RequestRateLimiterService(environment)
  const signingKeyCryptoService = new SigningKeyCryptoService(environment)
  const serviceHandleRepository = new PrismaServiceHandleRepositoryService(prismaClientService)

  return {
    handleRegistrationService: new HandleRegistrationService(
      requestSecurityRepository,
      serviceHandleRepository,
      signingKeyCryptoService
    ),
    handleSecurityService: new HandleSecurityService(
      requestSecurityRepository,
      serviceHandleRepository,
      signingKeyCryptoService
    ),
    prismaClientService,
    queueMessageService: new QueueMessageService(messageSignatureService, queueMessageRepository, environment),
    signedRequestAuthService: new SignedRequestAuthService(
      environment,
      messageSignatureService,
      requestRateLimiterService,
      requestSecurityRepository,
      serviceHandleRepository,
      signingKeyCryptoService
    ),
    systemHealthService: new SystemHealthService(prismaClientService),
  }
}

const registerRoutes = (
  fastify: FastifyInstance,
  environment: Environment,
  routeDependencies: RouteDependencies = createRouteDependencies(environment)
): void => {
  registerSystemRouteGroup(fastify, routeDependencies.systemHealthService)
  registerHandleRouteGroup(
    fastify,
    routeDependencies.handleRegistrationService,
    routeDependencies.handleSecurityService,
    routeDependencies.signedRequestAuthService
  )
  registerQueueRouteGroup(fastify, routeDependencies.queueMessageService, routeDependencies.signedRequestAuthService)
}

export { createRouteDependencies, registerRoutes, type RouteDependencies, type ServerRouteDependencies }
