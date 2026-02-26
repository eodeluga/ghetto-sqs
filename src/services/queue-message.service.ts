import { MessageNotFoundError } from '@/errors'
import { type QueueMessageRepositoryInterface } from '@/interfaces/queue-message-repository.interface'
import { type ChangeMessageVisibilityResponse } from '@/schemas/change-message-visibility.schema'
import { type DeleteMessageResponse } from '@/schemas/delete-message.schema'
import { type EnqueueMessageResponse } from '@/schemas/enqueue-message.schema'
import { type ReceiveMessagesResponse } from '@/schemas/receive-messages.schema'
import { MessageSignatureService } from '@/services/message-signature.service'
import { PrismaQueueMessageRepositoryService } from '@/services/prisma-queue-message-repository.service'

type ChangeMessageVisibilityInput = {
  messageId: string
  queueName: string
  receiptHandle: string
  serviceUserUuid: string
  visibilityTimeoutSeconds: number
}

type DeleteMessageInput = {
  messageId: string
  queueName: string
  receiptHandle: string
  serviceUserUuid: string
}

type EnqueueMessageInput = {
  body: unknown
  delaySeconds: number
  queueName: string
  serviceUserUuid: string
}

type ReceiveMessagesInput = {
  maxMessages: number
  queueName: string
  serviceUserUuid: string
  visibilityTimeoutSeconds: number
}

class QueueMessageService {
  private buildVisibilityDate(secondsFromNow: number): Date {
    return new Date(Date.now() + (secondsFromNow * 1000))
  }

  constructor(
    private readonly messageSignatureService: MessageSignatureService = new MessageSignatureService(),
    private readonly queueMessageRepository: QueueMessageRepositoryInterface = new PrismaQueueMessageRepositoryService()
  ) {}

  async changeMessageVisibility(
    changeMessageVisibilityInput: ChangeMessageVisibilityInput
  ): Promise<ChangeMessageVisibilityResponse> {
    const receiptHandleHash = this.messageSignatureService.createReceiptHandleHash(changeMessageVisibilityInput.receiptHandle)
    const nextVisibleAt = this.buildVisibilityDate(changeMessageVisibilityInput.visibilityTimeoutSeconds)
    const messageRecord = await this.queueMessageRepository.setQueueMessageVisibilityByReceiptHandle({
      messageId: changeMessageVisibilityInput.messageId,
      queueName: changeMessageVisibilityInput.queueName,
      receiptHandleHash,
      serviceUserUuid: changeMessageVisibilityInput.serviceUserUuid,
      visibleAt: nextVisibleAt,
    })

    if (messageRecord === null) {
      throw new MessageNotFoundError('Message not found for receipt handle')
    }

    return {
      messageId: messageRecord.id,
      visibleAt: messageRecord.visibleAt.toISOString(),
    }
  }

  async deleteMessage(deleteMessageInput: DeleteMessageInput): Promise<DeleteMessageResponse> {
    const receiptHandleHash = this.messageSignatureService.createReceiptHandleHash(deleteMessageInput.receiptHandle)
    const messageDeleted = await this.queueMessageRepository.deleteQueueMessageByReceiptHandle({
      messageId: deleteMessageInput.messageId,
      queueName: deleteMessageInput.queueName,
      receiptHandleHash,
      serviceUserUuid: deleteMessageInput.serviceUserUuid,
    })

    if (!messageDeleted) {
      throw new MessageNotFoundError('Message not found for receipt handle')
    }

    return {
      deleted: true,
      messageId: deleteMessageInput.messageId,
    }
  }

  async enqueueMessage(enqueueMessageInput: EnqueueMessageInput): Promise<EnqueueMessageResponse> {
    const visibleAt = this.buildVisibilityDate(enqueueMessageInput.delaySeconds)
    const queueMessage = await this.queueMessageRepository.createQueueMessage({
      body: enqueueMessageInput.body,
      queueName: enqueueMessageInput.queueName,
      serviceUserUuid: enqueueMessageInput.serviceUserUuid,
      visibleAt,
    })

    return {
      messageId: queueMessage.id,
      queueName: queueMessage.queueName,
      visibleAt: queueMessage.visibleAt.toISOString(),
    }
  }

  async receiveMessages(receiveMessagesInput: ReceiveMessagesInput): Promise<ReceiveMessagesResponse> {
    const claimableAt = new Date()
    const visibleCandidates = await this.queueMessageRepository.listVisibleQueueMessages({
      limit: receiveMessagesInput.maxMessages * 3,
      queueName: receiveMessagesInput.queueName,
      serviceUserUuid: receiveMessagesInput.serviceUserUuid,
      visibleAtOrBefore: claimableAt,
    })
    const receivedMessages: ReceiveMessagesResponse['messages'] = []

    for (const visibleCandidate of visibleCandidates) {
      if (receivedMessages.length >= receiveMessagesInput.maxMessages) {
        break
      }

      const nextReceiptHandle = this.messageSignatureService.createReceiptHandle()
      const nextReceiptHandleHash = this.messageSignatureService.createReceiptHandleHash(nextReceiptHandle)
      const nextVisibleAt = this.buildVisibilityDate(receiveMessagesInput.visibilityTimeoutSeconds)
      const messageClaimed = await this.queueMessageRepository.claimQueueMessageById({
        claimableAt,
        messageId: visibleCandidate.id,
        nextReceiptHandleHash,
        nextVisibleAt,
        queueName: receiveMessagesInput.queueName,
        serviceUserUuid: receiveMessagesInput.serviceUserUuid,
      })

      if (messageClaimed) {
        receivedMessages.push({
          body: visibleCandidate.body,
          messageId: visibleCandidate.id,
          queueName: visibleCandidate.queueName,
          receiptHandle: nextReceiptHandle,
          receiveCount: visibleCandidate.receiveCount + 1,
          visibleAt: nextVisibleAt.toISOString(),
        })
      }
    }

    return {
      messages: receivedMessages,
    }
  }
}

export {
  QueueMessageService,
  type ChangeMessageVisibilityInput,
  type DeleteMessageInput,
  type EnqueueMessageInput,
  type ReceiveMessagesInput,
}
