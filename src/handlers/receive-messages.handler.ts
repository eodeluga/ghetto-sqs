import { type FastifyReply, type FastifyRequest } from 'fastify'
import { InternalServerError, ValidationError } from '@/errors'
import {
  receiveMessagesPathParamsSchema,
  receiveMessagesQuerySchema,
  receiveMessagesResponseSchema,
} from '@/schemas/receive-messages.schema'
import { QueueMessageService } from '@/services/queue-message.service'

const DEFAULT_VISIBILITY_TIMEOUT_SECONDS = 30
const PUBLIC_SERVICE_USER_UUID = '00000000-0000-0000-0000-000000000000'

class ReceiveMessagesHandler {
  constructor(private readonly queueMessageService: QueueMessageService = new QueueMessageService()) {}

  async receiveMessages(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
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
      serviceUserUuid: PUBLIC_SERVICE_USER_UUID,
      visibilityTimeoutSeconds: queryParseResult.data.visibilityTimeoutSeconds
        ?? DEFAULT_VISIBILITY_TIMEOUT_SECONDS,
    })
    const responseParseResult = receiveMessagesResponseSchema.safeParse(receiveMessagesResponse)

    if (!responseParseResult.success) {
      throw new InternalServerError('Invalid receive response payload', responseParseResult.error.flatten(), ['response'])
    }

    return reply.code(200).send(responseParseResult.data)
  }
}

export { ReceiveMessagesHandler }
