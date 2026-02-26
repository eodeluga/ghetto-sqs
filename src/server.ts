import Fastify, { type FastifyInstance } from 'fastify'
import { readEnvironment, type Environment } from '@/config/environment'
import { registerErrorHandlerMiddleware } from '@/middleware/error-handler.middleware'
import { registerRequestIdMiddleware } from '@/middleware/request-id.middleware'
import { createRouteDependencies, registerRoutes, type RouteDependencies } from '@/routes'

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
  const routeDependencies = createRouteDependencies(environment)
  const fastify = buildServer(environment, routeDependencies)
  let serverIsShuttingDown = false
  const shutdownServer = async (): Promise<void> => {
    if (serverIsShuttingDown) {
      return
    }

    serverIsShuttingDown = true

    try {
      await fastify.close()
      await routeDependencies.prismaClientService.disconnect()
    } finally {
      process.exit(0)
    }
  }

  process.once('SIGINT', () => {
    void shutdownServer()
  })
  process.once('SIGTERM', () => {
    void shutdownServer()
  })

  await fastify.listen({
    host: environment.HOST,
    port: environment.PORT,
  })
}

export { buildServer, startServer }
