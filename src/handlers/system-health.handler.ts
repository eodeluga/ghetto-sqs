import { type FastifyReply, type FastifyRequest } from 'fastify'
import { SystemHealthService } from '@/services/system-health.service'

class SystemHealthHandler {
  constructor(private readonly systemHealthService: SystemHealthService = new SystemHealthService()) {}

  getSystemHealth(_request: FastifyRequest, reply: FastifyReply): FastifyReply {
    const systemHealth = this.systemHealthService.getSystemHealth()

    return reply.code(200).send(systemHealth)
  }
}

export { SystemHealthHandler }
