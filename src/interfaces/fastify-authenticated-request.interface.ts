import { type AuthenticatedServiceContext } from '@/interfaces/authenticated-service-context.interface'

declare module 'fastify' {
  interface FastifyRequest {
    authenticatedServiceContext?: AuthenticatedServiceContext
  }
}

export {}
