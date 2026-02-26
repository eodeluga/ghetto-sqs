import Fastify, { type FastifyInstance } from 'fastify'
import { readEnvironment, type Environment } from '@/config/environment'
import { registerRequestIdMiddleware } from '@/middleware/request-id.middleware'
import { registerRoutes } from '@/routes'

const buildServer = (environment: Environment = readEnvironment()): FastifyInstance => {
  const fastify = Fastify({
    logger: {
      level: environment.LOG_LEVEL,
    },
  })

  registerRequestIdMiddleware(fastify)
  registerRoutes(fastify)

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
