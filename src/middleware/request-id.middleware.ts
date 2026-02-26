import { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'

const registerRequestIdMiddleware = (fastify: FastifyInstance): void => {
  fastify.addHook('onRequest', (request: FastifyRequest, reply: FastifyReply, done): void => {
    reply.header('x-request-id', request.id)
    done()
  })
}

export { registerRequestIdMiddleware }
