import { type FastifyReply, type FastifyRequest } from 'fastify'
import { InternalServerError, ValidationError } from '@/errors'
import {
  enqueueMessagePathParamsSchema,
  enqueueMessageRequestSchema,
  enqueueMessageResponseSchema,
} from '@/schemas/enqueue-message.schema'
import { QueueMessageService } from '@/services/queue-message.service'
import { getAuthenticatedServiceContext } from '@/utils/authenticated-service-context.util'

class EnqueueMessageHandler {
  constructor(private readonly queueMessageService: QueueMessageService = new QueueMessageService()) {}

  async enqueueMessage(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const authenticatedServiceContext = getAuthenticatedServiceContext(request)
    const pathParamsParseResult = enqueueMessagePathParamsSchema.safeParse(request.params)

    if (!pathParamsParseResult.success) {
      throw new ValidationError('Invalid queue path parameters', pathParamsParseResult.error.flatten(), ['params'])
    }

    const bodyParseResult = enqueueMessageRequestSchema.safeParse(request.body)

    if (!bodyParseResult.success) {
      throw new ValidationError('Invalid enqueue request body', bodyParseResult.error.flatten(), ['body'])
    }

    const enqueueMessageResponse = await this.queueMessageService.enqueueMessage({
      body: bodyParseResult.data.body,
      deadLetterQueueName: bodyParseResult.data.deadLetterQueueName,
      delaySeconds: bodyParseResult.data.delaySeconds,
      maxReceiveCount: bodyParseResult.data.maxReceiveCount,
      messageDeduplicationId: bodyParseResult.data.messageDeduplicationId,
      messageGroupId: bodyParseResult.data.messageGroupId,
      queueName: pathParamsParseResult.data.queueName,
      serviceUserUuid: authenticatedServiceContext.userUuid,
    })
    const responseParseResult = enqueueMessageResponseSchema.safeParse(enqueueMessageResponse)

    if (!responseParseResult.success) {
      throw new InternalServerError('Invalid enqueue response payload', responseParseResult.error.flatten(), ['response'])
    }

    return reply.code(201).send(responseParseResult.data)
  }
}

export { EnqueueMessageHandler }
