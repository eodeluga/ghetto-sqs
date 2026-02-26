import { type FastifyReply, type FastifyRequest } from 'fastify'
import { InternalServerError, ValidationError } from '@/errors'
import {
  receiveMessagesPathParamsSchema,
  receiveMessagesQuerySchema,
  receiveMessagesResponseSchema,
} from '@/schemas/receive-messages.schema'
import { QueueMessageService } from '@/services/queue-message.service'
import { getAuthenticatedServiceContext } from '@/utils/authenticated-service-context.util'

class ReceiveMessagesHandler {
  constructor(private readonly queueMessageService: QueueMessageService = new QueueMessageService()) {}

  async receiveMessages(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const authenticatedServiceContext = getAuthenticatedServiceContext(request)
    const pathParamsParseResult = receiveMessagesPathParamsSchema.safeParse(request.params)

    if (!pathParamsParseResult.success) {
      throw new ValidationError('Invalid queue path parameters', pathParamsParseResult.error.flatten(), ['params'])
    }

    const queryParseResult = receiveMessagesQuerySchema.safeParse(request.query)

    if (!queryParseResult.success) {
      throw new ValidationError('Invalid receive query parameters', queryParseResult.error.flatten(), ['query'])
    }

    const receiveMessagesResponse = await this.queueMessageService.receiveMessages({
      maxMessages: queryParseResult.data.maxMessages,
      queueName: pathParamsParseResult.data.queueName,
      serviceUserUuid: authenticatedServiceContext.userUuid,
      visibilityTimeoutSeconds: queryParseResult.data.visibilityTimeoutSeconds,
    })
    const responseParseResult = receiveMessagesResponseSchema.safeParse(receiveMessagesResponse)

    if (!responseParseResult.success) {
      throw new InternalServerError('Invalid receive response payload', responseParseResult.error.flatten(), ['response'])
    }

    return reply.code(200).send(responseParseResult.data)
  }
}

export { ReceiveMessagesHandler }
