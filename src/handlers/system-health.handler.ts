import { type FastifyReply, type FastifyRequest } from 'fastify'
import { InternalServerError, ServiceUnavailableError } from '@/errors'
import { systemHealthResponseSchema, systemReadinessResponseSchema } from '@/schemas/system-health.schema'
import { SystemHealthService } from '@/services/system-health.service'

class SystemHealthHandler {
  constructor(private readonly systemHealthService: SystemHealthService = new SystemHealthService()) {}

  getLiveness(_request: FastifyRequest, reply: FastifyReply): FastifyReply {
    const systemHealth = this.systemHealthService.getSystemHealth()
    const parseResult = systemHealthResponseSchema.safeParse(systemHealth)

    if (!parseResult.success) {
      throw new InternalServerError('Invalid liveness response payload', parseResult.error.flatten(), ['response'])
    }

    return reply.code(200).send(parseResult.data)
  }

  async getReadiness(_request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const systemReadiness = await this.systemHealthService.getSystemReadiness()
    const parseResult = systemReadinessResponseSchema.safeParse(systemReadiness)

    if (!parseResult.success) {
      throw new InternalServerError('Invalid readiness response payload', parseResult.error.flatten(), ['response'])
    }

    if (parseResult.data.status !== 'ready') {
      throw new ServiceUnavailableError('Service dependencies are not ready')
    }

    return reply.code(200).send(parseResult.data)
  }
}

export { SystemHealthHandler }
