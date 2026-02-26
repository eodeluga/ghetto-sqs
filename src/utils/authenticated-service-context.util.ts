import { type FastifyRequest } from 'fastify'
import { UnauthorisedError } from '@/errors'
import { type AuthenticatedServiceContext } from '@/interfaces/authenticated-service-context.interface'

const getAuthenticatedServiceContext = (request: FastifyRequest): AuthenticatedServiceContext => {
  const authenticatedServiceContext = request.authenticatedServiceContext

  if (authenticatedServiceContext === undefined) {
    throw new UnauthorisedError('Missing authenticated service context')
  }

  return authenticatedServiceContext
}

export { getAuthenticatedServiceContext }
