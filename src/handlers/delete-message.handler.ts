import { type FastifyReply, type FastifyRequest } from 'fastify'
import { InternalServerError, ValidationError } from '@/errors'
import {
  deleteMessagePathParamsSchema,
  deleteMessageRequestSchema,
  deleteMessageResponseSchema,
} from '@/schemas/delete-message.schema'
import { QueueMessageService } from '@/services/queue-message.service'
import { getAuthenticatedServiceContext } from '@/utils/authenticated-service-context.util'

class DeleteMessageHandler {
  constructor(private readonly queueMessageService: QueueMessageService = new QueueMessageService()) {}

  async deleteMessage(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const authenticatedServiceContext = getAuthenticatedServiceContext(request)
    const pathParamsParseResult = deleteMessagePathParamsSchema.safeParse(request.params)

    if (!pathParamsParseResult.success) {
      throw new ValidationError('Invalid delete path parameters', pathParamsParseResult.error.flatten(), ['params'])
    }

    const requestParseResult = deleteMessageRequestSchema.safeParse(request.body)

    if (!requestParseResult.success) {
      throw new ValidationError('Invalid delete request body', requestParseResult.error.flatten(), ['body'])
    }

    const deleteMessageResponse = await this.queueMessageService.deleteMessage({
      messageId: pathParamsParseResult.data.messageId,
      queueName: pathParamsParseResult.data.queueName,
      receiptHandle: requestParseResult.data.receiptHandle,
      serviceUserUuid: authenticatedServiceContext.userUuid,
    })
    const responseParseResult = deleteMessageResponseSchema.safeParse(deleteMessageResponse)

    if (!responseParseResult.success) {
      throw new InternalServerError('Invalid delete response payload', responseParseResult.error.flatten(), ['response'])
    }

    return reply.code(200).send(responseParseResult.data)
  }
}

export { DeleteMessageHandler }
