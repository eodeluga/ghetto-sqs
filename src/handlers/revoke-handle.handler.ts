import { type FastifyReply, type FastifyRequest } from 'fastify'
import { InternalServerError } from '@/errors'
import { revokeHandleResponseSchema } from '@/schemas/revoke-handle.schema'
import { HandleSecurityService } from '@/services/handle-security.service'
import { getAuthenticatedServiceContext } from '@/utils/authenticated-service-context.util'

class RevokeHandleHandler {
  constructor(private readonly handleSecurityService: HandleSecurityService = new HandleSecurityService()) {}

  async revokeHandle(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const authenticatedServiceContext = getAuthenticatedServiceContext(request)
    const revokeHandleResponse = await this.handleSecurityService.revokeHandle(authenticatedServiceContext.userUuid)
    const responseParseResult = revokeHandleResponseSchema.safeParse(revokeHandleResponse)

    if (!responseParseResult.success) {
      throw new InternalServerError('Invalid revoke-handle response payload', responseParseResult.error.flatten(), ['response'])
    }

    return reply.code(200).send(responseParseResult.data)
  }
}

export { RevokeHandleHandler }
