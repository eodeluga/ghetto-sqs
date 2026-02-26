import { type FastifyInstance } from 'fastify'
import { registerHandleRouteGroup } from '@/route-groups/handle.route-group'
import { registerSystemRouteGroup } from '@/route-groups/system.route-group'
import { HandleRegistrationService } from '@/services/handle-registration.service'
import { SystemHealthService } from '@/services/system-health.service'

interface RouteDependencies {
  handleRegistrationService: HandleRegistrationService
  systemHealthService: SystemHealthService
}

const createRouteDependencies = (): RouteDependencies => {
  return {
    handleRegistrationService: new HandleRegistrationService(),
    systemHealthService: new SystemHealthService(),
  }
}

const registerRoutes = (
  fastify: FastifyInstance,
  routeDependencies: RouteDependencies = createRouteDependencies()
): void => {
  registerSystemRouteGroup(fastify, routeDependencies.systemHealthService)
  registerHandleRouteGroup(fastify, routeDependencies.handleRegistrationService)
}

export { registerRoutes }
