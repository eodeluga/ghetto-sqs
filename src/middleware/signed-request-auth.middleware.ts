import { type FastifyReply, type FastifyRequest, type preHandlerHookHandler } from 'fastify'
import { ValidationError } from '@/errors'
import { serviceAuthHeadersSchema } from '@/schemas/service-auth-headers.schema'
import { SignedRequestAuthService } from '@/services/signed-request-auth.service'

const createSignedRequestAuthPreHandler = (
  signedRequestAuthService: SignedRequestAuthService
): preHandlerHookHandler => {
  return (request: FastifyRequest, reply: FastifyReply, done): void => {
    void reply
    const headerParseResult = serviceAuthHeadersSchema.safeParse(request.headers)

    if (!headerParseResult.success) {
      done(new ValidationError('Invalid signed request headers', headerParseResult.error.flatten(), ['headers']))
      return
    }

    const serviceAuthHeaders = headerParseResult.data

    signedRequestAuthService.verifySignedRequest({
      body: request.body,
      method: request.method,
      requestPath: request.url,
      signature: serviceAuthHeaders['x-gsqs-signature'],
      timestamp: serviceAuthHeaders['x-gsqs-timestamp'],
      userUuid: serviceAuthHeaders['x-gsqs-user-uuid'],
    }).then(() => {
      request.authenticatedServiceContext = {
        userUuid: serviceAuthHeaders['x-gsqs-user-uuid'],
      }
      done()
    }).catch((error: unknown) => {
      done(error as Error)
    })
  }
}

export { createSignedRequestAuthPreHandler }
