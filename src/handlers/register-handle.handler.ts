import { type FastifyReply, type FastifyRequest } from 'fastify'
import {
  registerHandleRequestSchema,
  registerHandleResponseSchema,
} from '@/schemas/register-handle.schema'
import { HandleRegistrationService } from '@/services/handle-registration.service'

class RegisterHandleHandler {
  constructor(private readonly handleRegistrationService: HandleRegistrationService = new HandleRegistrationService()) {}

  registerHandle(request: FastifyRequest, reply: FastifyReply): FastifyReply {
    const requestParseResult = registerHandleRequestSchema.safeParse(request.body)

    if (!requestParseResult.success) {
      return reply.code(400).send({
        error: 'Invalid request body',
        issues: requestParseResult.error.flatten(),
      })
    }

    const registerHandleResponse = this.handleRegistrationService.registerHandle(requestParseResult.data)
    const responseParseResult = registerHandleResponseSchema.safeParse(registerHandleResponse)

    if (!responseParseResult.success) {
      return reply.code(500).send({
        error: 'Invalid register-handle response payload',
        issues: responseParseResult.error.flatten(),
      })
    }

    return reply.code(201).send(responseParseResult.data)
  }
}

export { RegisterHandleHandler }
