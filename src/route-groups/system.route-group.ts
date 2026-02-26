import { type FastifyInstance } from 'fastify'
import { SystemHealthHandler } from '@/handlers/system-health.handler'
import { SystemHealthService } from '@/services/system-health.service'

const registerSystemRouteGroup = (
  fastify: FastifyInstance,
  systemHealthService: SystemHealthService = new SystemHealthService()
): void => {
  const systemHealthHandler = new SystemHealthHandler(systemHealthService)

  fastify.get('/health', (request, reply) => {
    return systemHealthHandler.getSystemHealth(request, reply)
  })
}

export { registerSystemRouteGroup }
