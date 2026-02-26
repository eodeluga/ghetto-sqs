import { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { BaseError, InternalServerError, ValidationError } from '@/errors'
import { errorResponseSchema, type ErrorResponse } from '@/schemas/error-response.schema'

const createErrorResponse = (baseError: BaseError, requestId: string): ErrorResponse => {
  const errorResponse: ErrorResponse = {
    code: baseError.code,
    details: baseError.details,
    message: baseError.message,
    requestId,
  }
  const parseResult = errorResponseSchema.safeParse(errorResponse)

  if (parseResult.success) {
    return parseResult.data
  }

  return {
    code: 'internal_server_error',
    details: parseResult.error.flatten(),
    message: 'Error payload validation failed',
    requestId,
  }
}

const mapToBaseError = (error: unknown): BaseError => {
  if (error instanceof BaseError) {
    return error
  }

  if (error instanceof ZodError) {
    return new ValidationError('Validation failed', error.flatten())
  }

  if (error instanceof Error) {
    return new InternalServerError('Unexpected server error', error.message)
  }

  return new InternalServerError('Unexpected server error', error)
}

const registerErrorHandlerMiddleware = (fastify: FastifyInstance): void => {
  fastify.setErrorHandler((error: unknown, request: FastifyRequest, reply: FastifyReply): FastifyReply => {
    const baseError = mapToBaseError(error)
    const errorResponse = createErrorResponse(baseError, request.id)

    return reply.code(baseError.status).send(errorResponse)
  })
}

export { registerErrorHandlerMiddleware }
