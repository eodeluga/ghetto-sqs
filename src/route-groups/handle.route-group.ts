import { type FastifyInstance } from 'fastify'
import { RegisterHandleHandler } from '@/handlers/register-handle.handler'
import { RevokeHandleHandler } from '@/handlers/revoke-handle.handler'
import { RotateSigningKeyHandler } from '@/handlers/rotate-signing-key.handler'
import { createSignedRequestAuthPreHandler } from '@/middleware/signed-request-auth.middleware'
import { HandleRegistrationService } from '@/services/handle-registration.service'
import { HandleSecurityService } from '@/services/handle-security.service'
import { SignedRequestAuthService } from '@/services/signed-request-auth.service'

const registerHandleRouteGroup = (
  fastify: FastifyInstance,
  handleRegistrationService: HandleRegistrationService = new HandleRegistrationService(),
  handleSecurityService: HandleSecurityService = new HandleSecurityService(),
  signedRequestAuthService?: SignedRequestAuthService
): void => {
  const registerHandleHandler = new RegisterHandleHandler(handleRegistrationService)
  const revokeHandleHandler = new RevokeHandleHandler(handleSecurityService)
  const rotateSigningKeyHandler = new RotateSigningKeyHandler(handleSecurityService)
  const signedRequestAuthPreHandler = signedRequestAuthService === undefined
    ? undefined
    : createSignedRequestAuthPreHandler(signedRequestAuthService)

  fastify.post('/v1/handles/register', (request, reply) => {
    return registerHandleHandler.registerHandle(request, reply)
  })

  if (signedRequestAuthPreHandler === undefined) {
    return
  }

  fastify.post('/v1/handles/keys/rotate', {
    preHandler: signedRequestAuthPreHandler,
  }, (request, reply) => {
    return rotateSigningKeyHandler.rotateSigningKey(request, reply)
  })
  fastify.post('/v1/handles/revoke', {
    preHandler: signedRequestAuthPreHandler,
  }, (request, reply) => {
    return revokeHandleHandler.revokeHandle(request, reply)
  })
}

export { registerHandleRouteGroup }
