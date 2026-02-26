import { type FastifyReply, type FastifyRequest } from 'fastify'
import { InternalServerError, ValidationError } from '@/errors'
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
      throw new ValidationError('Invalid request body', requestParseResult.error.flatten(), ['body'])
    }

    const registerHandleResponse = this.handleRegistrationService.registerHandle(requestParseResult.data)
    const responseParseResult = registerHandleResponseSchema.safeParse(registerHandleResponse)

    if (!responseParseResult.success) {
      throw new InternalServerError('Invalid register-handle response payload', responseParseResult.error.flatten(), ['response'])
    }

    return reply.code(201).send(responseParseResult.data)
  }
}

export { RegisterHandleHandler }
