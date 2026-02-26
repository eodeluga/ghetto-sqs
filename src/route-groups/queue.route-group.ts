import { type FastifyInstance } from 'fastify'
import { ChangeMessageVisibilityHandler } from '@/handlers/change-message-visibility.handler'
import { DeleteMessageHandler } from '@/handlers/delete-message.handler'
import { EnqueueMessageHandler } from '@/handlers/enqueue-message.handler'
import { ReceiveMessagesHandler } from '@/handlers/receive-messages.handler'
import { createSignedRequestAuthPreHandler } from '@/middleware/signed-request-auth.middleware'
import { QueueMessageService } from '@/services/queue-message.service'
import { SignedRequestAuthService } from '@/services/signed-request-auth.service'

const registerQueueRouteGroup = (
  fastify: FastifyInstance,
  queueMessageService: QueueMessageService,
  signedRequestAuthService: SignedRequestAuthService
): void => {
  const changeMessageVisibilityHandler = new ChangeMessageVisibilityHandler(queueMessageService)
  const deleteMessageHandler = new DeleteMessageHandler(queueMessageService)
  const enqueueMessageHandler = new EnqueueMessageHandler(queueMessageService)
  const receiveMessagesHandler = new ReceiveMessagesHandler(queueMessageService)
  const signedRequestAuthPreHandler = createSignedRequestAuthPreHandler(signedRequestAuthService)

  fastify.post('/v1/queues/:queueName/messages', {
    preHandler: signedRequestAuthPreHandler,
  }, (request, reply) => {
    return enqueueMessageHandler.enqueueMessage(request, reply)
  })

  fastify.get('/v1/queues/:queueName/messages/receive', {
    preHandler: signedRequestAuthPreHandler,
  }, (request, reply) => {
    return receiveMessagesHandler.receiveMessages(request, reply)
  })

  fastify.delete('/v1/queues/:queueName/messages/:messageId', {
    preHandler: signedRequestAuthPreHandler,
  }, (request, reply) => {
    return deleteMessageHandler.deleteMessage(request, reply)
  })

  fastify.post('/v1/queues/:queueName/messages/:messageId/visibility', {
    preHandler: signedRequestAuthPreHandler,
  }, (request, reply) => {
    return changeMessageVisibilityHandler.changeMessageVisibility(request, reply)
  })
}

export { registerQueueRouteGroup }
