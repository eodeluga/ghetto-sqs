import { type FastifyInstance } from 'fastify'
import { RegisterHandleHandler } from '@/handlers/register-handle.handler'
import { HandleRegistrationService } from '@/services/handle-registration.service'

const registerHandleRouteGroup = (
  fastify: FastifyInstance,
  handleRegistrationService: HandleRegistrationService = new HandleRegistrationService()
): void => {
  const registerHandleHandler = new RegisterHandleHandler(handleRegistrationService)

  fastify.post('/v1/handles/register', (request, reply) => {
    return registerHandleHandler.registerHandle(request, reply)
  })
}

export { registerHandleRouteGroup }
