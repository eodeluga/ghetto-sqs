import { type FastifyReply, type FastifyRequest } from 'fastify'
import { InternalServerError, ValidationError } from '@/errors'
import {
  changeMessageVisibilityPathParamsSchema,
  changeMessageVisibilityRequestSchema,
  changeMessageVisibilityResponseSchema,
} from '@/schemas/change-message-visibility.schema'
import { QueueMessageService } from '@/services/queue-message.service'

class ChangeMessageVisibilityHandler {
  constructor(private readonly queueMessageService: QueueMessageService = new QueueMessageService()) {}

  async changeMessageVisibility(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const pathParamsParseResult = changeMessageVisibilityPathParamsSchema.safeParse(request.params)

    if (!pathParamsParseResult.success) {
      throw new ValidationError('Invalid visibility path parameters', pathParamsParseResult.error.flatten(), ['params'])
    }

    const requestParseResult = changeMessageVisibilityRequestSchema.safeParse(request.body)

    if (!requestParseResult.success) {
      throw new ValidationError('Invalid visibility request body', requestParseResult.error.flatten(), ['body'])
    }

    const changeMessageVisibilityResponse = await this.queueMessageService.changeMessageVisibility({
      queueName: pathParamsParseResult.data.queueName,
      receiptHandle: requestParseResult.data.receiptHandle,
      visibilityTimeoutSeconds: requestParseResult.data.visibilityTimeoutSeconds,
    })
    const responseParseResult = changeMessageVisibilityResponseSchema.safeParse(changeMessageVisibilityResponse)

    if (!responseParseResult.success) {
      throw new InternalServerError('Invalid visibility response payload', responseParseResult.error.flatten(), ['response'])
    }

    return reply.code(200).send(responseParseResult.data)
  }
}

export { ChangeMessageVisibilityHandler }
