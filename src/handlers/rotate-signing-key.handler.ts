import { type FastifyReply, type FastifyRequest } from 'fastify'
import { InternalServerError } from '@/errors'
import { rotateSigningKeyResponseSchema } from '@/schemas/rotate-signing-key.schema'
import { HandleSecurityService } from '@/services/handle-security.service'
import { getAuthenticatedServiceContext } from '@/utils/authenticated-service-context.util'

class RotateSigningKeyHandler {
  constructor(private readonly handleSecurityService: HandleSecurityService = new HandleSecurityService()) {}

  async rotateSigningKey(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const authenticatedServiceContext = getAuthenticatedServiceContext(request)
    const rotateSigningKeyResponse = await this.handleSecurityService.rotateSigningKey(authenticatedServiceContext.userUuid)
    const responseParseResult = rotateSigningKeyResponseSchema.safeParse(rotateSigningKeyResponse)

    if (!responseParseResult.success) {
      throw new InternalServerError(
        'Invalid rotate-signing-key response payload',
        responseParseResult.error.flatten(),
        ['response']
      )
    }

    return reply.code(200).send(responseParseResult.data)
  }
}

export { RotateSigningKeyHandler }
