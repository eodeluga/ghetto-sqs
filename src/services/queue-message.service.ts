import { MessageNotFoundError, ValidationError } from '@/errors'
import { type Environment, readEnvironment } from '@/config/environment'
import { type QueueMessageRepositoryInterface } from '@/interfaces/queue-message-repository.interface'
import { type ChangeMessageVisibilityResponse } from '@/schemas/change-message-visibility.schema'
import { type DeleteMessageResponse } from '@/schemas/delete-message.schema'
import { type EnqueueMessageResponse } from '@/schemas/enqueue-message.schema'
import { type ReceiveMessagesResponse } from '@/schemas/receive-messages.schema'
import { MessageSignatureService } from '@/services/message-signature.service'
import { PrismaQueueMessageRepositoryService } from '@/services/prisma-queue-message-repository.service'
import { isFifoQueue } from '@/utils/is-fifo-queue.util'

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
  defaultMaxReceiveCount: number
  deadLetterQueueName?: string
  delaySeconds: number
  maxReceiveCount?: number
  messageDeduplicationId?: string
  messageGroupId?: string
  queueName: string
  serviceUserUuid: string
}

type ReceiveMessagesInput = {
  maxMessages: number
  queueName: string
  serviceUserUuid: string
  visibilityTimeoutSeconds: number
}

type QueuePolicyConfiguration = {
  maxVisibilityExtensions: number
  messageRetentionSeconds: number
  poisonMessageReceiveThreshold: number
}

class QueueMessageService {
  private buildVisibilityDate(secondsFromNow: number): Date {
    return new Date(Date.now() + (secondsFromNow * 1000))
  }

  private buildRetentionCutoffDate(): Date {
    return new Date(Date.now() - (this.queuePolicyConfiguration.messageRetentionSeconds * 1000))
  }

  private ensureQueuePolicyIsValid(enqueueMessageInput: EnqueueMessageInput): void {
    const deadLetterQueueNameDefined = enqueueMessageInput.deadLetterQueueName !== undefined
    const maxReceiveCountDefined = enqueueMessageInput.maxReceiveCount !== undefined

    if (!deadLetterQueueNameDefined && maxReceiveCountDefined) {
      throw new ValidationError('maxReceiveCount requires deadLetterQueueName', undefined, ['body', 'maxReceiveCount'])
    }

    if (enqueueMessageInput.deadLetterQueueName === enqueueMessageInput.queueName) {
      throw new ValidationError('deadLetterQueueName must differ from queueName', undefined, ['body', 'deadLetterQueueName'])
    }

    const fifoQueue = isFifoQueue(enqueueMessageInput.queueName)

    if (fifoQueue && enqueueMessageInput.messageGroupId === undefined) {
      throw new ValidationError('FIFO queue requires messageGroupId', undefined, ['body', 'messageGroupId'])
    }

    if (!fifoQueue && enqueueMessageInput.messageGroupId !== undefined) {
      throw new ValidationError('messageGroupId can only be used with FIFO queues', undefined, ['body', 'messageGroupId'])
    }

    if (!fifoQueue && enqueueMessageInput.messageDeduplicationId !== undefined) {
      throw new ValidationError(
        'messageDeduplicationId can only be used with FIFO queues',
        undefined,
        ['body', 'messageDeduplicationId']
      )
    }
  }

  private isDlqRedriveCandidate(queueMessageRecord: {
    deadLetterQueueName: string | null
    maxReceiveCount: number | null
    receiveCount: number
  }): boolean {
    return queueMessageRecord.deadLetterQueueName !== null
      && queueMessageRecord.maxReceiveCount !== null
      && queueMessageRecord.receiveCount >= queueMessageRecord.maxReceiveCount
  }

  constructor(
    private readonly messageSignatureService: MessageSignatureService = new MessageSignatureService(),
    private readonly queueMessageRepository: QueueMessageRepositoryInterface = new PrismaQueueMessageRepositoryService(),
    environment: Environment = readEnvironment()
  ) {
    this.queuePolicyConfiguration = {
      maxVisibilityExtensions: environment.MAX_VISIBILITY_EXTENSIONS,
      messageRetentionSeconds: environment.QUEUE_MESSAGE_RETENTION_SECONDS,
      poisonMessageReceiveThreshold: environment.POISON_MESSAGE_RECEIVE_THRESHOLD,
    }
  }

  private readonly queuePolicyConfiguration: QueuePolicyConfiguration

  async changeMessageVisibility(
    changeMessageVisibilityInput: ChangeMessageVisibilityInput
  ): Promise<ChangeMessageVisibilityResponse> {
    const receiptHandleHash = this.messageSignatureService.createReceiptHandleHash(changeMessageVisibilityInput.receiptHandle)
    const queueMessageRecord = await this.queueMessageRepository.getQueueMessageByReceiptHandle(
      changeMessageVisibilityInput.messageId,
      changeMessageVisibilityInput.queueName,
      receiptHandleHash,
      changeMessageVisibilityInput.serviceUserUuid
    )

    if (queueMessageRecord === null) {
      throw new MessageNotFoundError('Message not found for receipt handle')
    }

    if (queueMessageRecord.visibilityChangeCount >= this.queuePolicyConfiguration.maxVisibilityExtensions) {
      throw new ValidationError('Maximum visibility timeout changes exceeded', undefined, ['body', 'visibilityTimeoutSeconds'])
    }

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
    await this.queueMessageRepository.purgeExpiredQueueMessages(
      this.buildRetentionCutoffDate(),
      enqueueMessageInput.queueName,
      enqueueMessageInput.serviceUserUuid
    )
    this.ensureQueuePolicyIsValid(enqueueMessageInput)

    if (enqueueMessageInput.messageDeduplicationId !== undefined) {
      const deduplicationWindowStart = new Date(Date.now() - (5 * 60 * 1000))
      const existingQueueMessage = await this.queueMessageRepository.findRecentMessageByDeduplicationId({
        createdAtOrAfter: deduplicationWindowStart,
        messageDeduplicationId: enqueueMessageInput.messageDeduplicationId,
        queueName: enqueueMessageInput.queueName,
        serviceUserUuid: enqueueMessageInput.serviceUserUuid,
      })

      if (existingQueueMessage !== null) {
        return {
          deduplicated: true,
          messageId: existingQueueMessage.id,
          queueName: existingQueueMessage.queueName,
          visibleAt: existingQueueMessage.visibleAt.toISOString(),
        }
      }
    }

    const effectiveMaxReceiveCount = enqueueMessageInput.deadLetterQueueName === undefined
      ? null
      : (enqueueMessageInput.maxReceiveCount ?? enqueueMessageInput.defaultMaxReceiveCount)
    const visibleAt = this.buildVisibilityDate(enqueueMessageInput.delaySeconds)
    const queueMessage = await this.queueMessageRepository.createQueueMessage({
      body: enqueueMessageInput.body,
      deadLetterQueueName: enqueueMessageInput.deadLetterQueueName ?? null,
      maxReceiveCount: effectiveMaxReceiveCount,
      messageDeduplicationId: enqueueMessageInput.messageDeduplicationId ?? null,
      messageGroupId: enqueueMessageInput.messageGroupId ?? null,
      queueName: enqueueMessageInput.queueName,
      serviceUserUuid: enqueueMessageInput.serviceUserUuid,
      visibleAt,
    })

    return {
      deduplicated: false,
      messageId: queueMessage.id,
      queueName: queueMessage.queueName,
      visibleAt: queueMessage.visibleAt.toISOString(),
    }
  }

  async receiveMessages(receiveMessagesInput: ReceiveMessagesInput): Promise<ReceiveMessagesResponse> {
    await this.queueMessageRepository.purgeExpiredQueueMessages(
      this.buildRetentionCutoffDate(),
      receiveMessagesInput.queueName,
      receiveMessagesInput.serviceUserUuid
    )
    const claimableAt = new Date()
    const candidateLimit = Math.min(100, receiveMessagesInput.maxMessages * 10)
    const visibleCandidates = await this.queueMessageRepository.listVisibleQueueMessages({
      limit: candidateLimit,
      queueName: receiveMessagesInput.queueName,
      serviceUserUuid: receiveMessagesInput.serviceUserUuid,
      visibleAtOrBefore: claimableAt,
    })
    const receivedMessages: ReceiveMessagesResponse['messages'] = []

    for (const visibleCandidate of visibleCandidates) {
      if (receivedMessages.length >= receiveMessagesInput.maxMessages) {
        break
      }

      if (this.isDlqRedriveCandidate(visibleCandidate)) {
        await this.queueMessageRepository.moveQueueMessageToDeadLetterQueue({
          deadLetterQueueName: visibleCandidate.deadLetterQueueName as string,
          messageId: visibleCandidate.id,
          queueName: receiveMessagesInput.queueName,
          serviceUserUuid: receiveMessagesInput.serviceUserUuid,
        })
        continue
      }

      if (visibleCandidate.deadLetterQueueName === null
        && visibleCandidate.receiveCount >= this.queuePolicyConfiguration.poisonMessageReceiveThreshold
      ) {
        await this.queueMessageRepository.deleteQueueMessageById(
          visibleCandidate.id,
          receiveMessagesInput.queueName,
          receiveMessagesInput.serviceUserUuid
        )
        continue
      }

      if (isFifoQueue(receiveMessagesInput.queueName) && visibleCandidate.messageGroupId !== null) {
        const inflightInSameGroup = await this.queueMessageRepository.hasInflightMessageInFifoGroup({
          createdAtBefore: visibleCandidate.createdAt,
          messageGroupId: visibleCandidate.messageGroupId,
          queueName: receiveMessagesInput.queueName,
          serviceUserUuid: receiveMessagesInput.serviceUserUuid,
          visibleAtAfter: claimableAt,
        })

        if (inflightInSameGroup) {
          continue
        }
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
          messageGroupId: visibleCandidate.messageGroupId ?? undefined,
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
