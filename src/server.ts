import Fastify, { type FastifyInstance } from 'fastify'
import { readEnvironment, type Environment } from '@/config/environment'
import { registerErrorHandlerMiddleware } from '@/middleware/error-handler.middleware'
import { registerRequestIdMiddleware } from '@/middleware/request-id.middleware'
import { registerRoutes, type RouteDependencies } from '@/routes'

const buildServer = (
  environment: Environment = readEnvironment(),
  routeDependencies?: RouteDependencies
): FastifyInstance => {
  const fastify = Fastify({
    logger: {
      level: environment.LOG_LEVEL,
    },
  })

  registerRequestIdMiddleware(fastify)
  registerErrorHandlerMiddleware(fastify)
  registerRoutes(fastify, environment, routeDependencies)

  return fastify
}

const startServer = async (): Promise<void> => {
  const environment = readEnvironment()
  const fastify = buildServer(environment)

  await fastify.listen({
    host: environment.HOST,
    port: environment.PORT,
  })
}

export { buildServer, startServer }
