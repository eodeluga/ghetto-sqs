import { type Environment, readEnvironment } from '@/config/environment'
import { ReceiptHandleInvalidError, ValidationError } from '@/errors'
import { type QueueMessageRepositoryInterface } from '@/interfaces/queue-message-repository.interface'
import { type ChangeMessageVisibilityResponse } from '@/schemas/change-message-visibility.schema'
import { type DeleteMessageResponse } from '@/schemas/delete-message.schema'
import { type EnqueueMessageResponse } from '@/schemas/enqueue-message.schema'
import { type ReceiveMessagesResponse } from '@/schemas/receive-messages.schema'
import { MessageSignatureService } from '@/services/message-signature.service'
import { PrismaQueueMessageRepositoryService } from '@/services/prisma-queue-message-repository.service'
import { isFifoQueue } from '@/utils/is-fifo-queue.util'

type ChangeMessageVisibilityInput = {
  queueName: string
  receiptHandle: string
  visibilityTimeoutSeconds: number
}

type DeleteMessageInput = {
  queueName: string
  receiptHandle: string
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
}

type ReceiveMessagesInput = {
  maxMessages: number
  queueName: string
  visibilityTimeoutSeconds: number
}

type QueuePolicyConfiguration = {
  maxVisibilityExtensions: number
  messageRetentionSeconds: number
  poisonMessageReceiveThreshold: number
}

class QueueMessageService {
  private buildRetentionCutoffDate(): Date {
    return new Date(Date.now() - (this.queuePolicyConfiguration.messageRetentionSeconds * 1000))
  }

  private buildVisibilityExpiryDate(secondsFromNow: number): Date {
    return new Date(Date.now() + (secondsFromNow * 1000))
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
    approximateReceiveCount: number
    deadLetterQueueName: string | null
    maxReceiveCount: number | null
  }): boolean {
    return queueMessageRecord.deadLetterQueueName !== null
      && queueMessageRecord.maxReceiveCount !== null
      && queueMessageRecord.approximateReceiveCount >= queueMessageRecord.maxReceiveCount
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
    const visibilitySetRequestedAt = new Date()
    const queueMessageRecord = await this.queueMessageRepository.getQueueMessageByReceiptHandle({
      queueName: changeMessageVisibilityInput.queueName,
      receiptHandle: changeMessageVisibilityInput.receiptHandle,
      visibleAfter: visibilitySetRequestedAt,
    })

    if (queueMessageRecord === null) {
      throw new ReceiptHandleInvalidError('Receipt handle is invalid')
    }

    if (queueMessageRecord.visibilityChangeCount >= this.queuePolicyConfiguration.maxVisibilityExtensions) {
      throw new ValidationError('Maximum visibility timeout changes exceeded', undefined, ['body', 'visibilityTimeoutSeconds'])
    }

    const visibilityExpiresAt = this.buildVisibilityExpiryDate(changeMessageVisibilityInput.visibilityTimeoutSeconds)
    const messageRecord = await this.queueMessageRepository.setQueueMessageVisibilityByReceiptHandle({
      queueName: changeMessageVisibilityInput.queueName,
      receiptHandle: changeMessageVisibilityInput.receiptHandle,
      visibilityExpiresAt,
      visibilitySetRequestedAt,
    })

    if (messageRecord?.visibilityExpiresAt === null || messageRecord === null) {
      throw new ReceiptHandleInvalidError('Receipt handle is invalid')
    }

    return {
      messageId: messageRecord.id,
      visibleAt: messageRecord.visibilityExpiresAt.toISOString(),
    }
  }

  async deleteMessage(deleteMessageInput: DeleteMessageInput): Promise<DeleteMessageResponse> {
    const messageDeleted = await this.queueMessageRepository.deleteQueueMessageByReceiptHandle({
      deleteRequestedAt: new Date(),
      queueName: deleteMessageInput.queueName,
      receiptHandle: deleteMessageInput.receiptHandle,
    })

    if (!messageDeleted) {
      throw new ReceiptHandleInvalidError('Receipt handle is invalid')
    }

    return {
      deleted: true,
    }
  }

  async enqueueMessage(enqueueMessageInput: EnqueueMessageInput): Promise<EnqueueMessageResponse> {
    await this.queueMessageRepository.purgeExpiredQueueMessages(
      this.buildRetentionCutoffDate(),
      enqueueMessageInput.queueName
    )
    this.ensureQueuePolicyIsValid(enqueueMessageInput)

    if (enqueueMessageInput.messageDeduplicationId !== undefined) {
      const deduplicationWindowStart = new Date(Date.now() - (5 * 60 * 1000))
      const existingQueueMessage = await this.queueMessageRepository.findRecentMessageByDeduplicationId({
        messageDeduplicationId: enqueueMessageInput.messageDeduplicationId,
        queueName: enqueueMessageInput.queueName,
        sentAtOrAfter: deduplicationWindowStart,
      })

      if (existingQueueMessage !== null) {
        return {
          deduplicated: true,
          messageId: existingQueueMessage.id,
          queueName: existingQueueMessage.queueName,
          visibleAt: (existingQueueMessage.visibilityExpiresAt ?? new Date()).toISOString(),
        }
      }
    }

    const effectiveMaxReceiveCount = enqueueMessageInput.deadLetterQueueName === undefined
      ? null
      : (enqueueMessageInput.maxReceiveCount ?? enqueueMessageInput.defaultMaxReceiveCount)
    const visibilityExpiresAt = enqueueMessageInput.delaySeconds === 0
      ? null
      : this.buildVisibilityExpiryDate(enqueueMessageInput.delaySeconds)
    const queueMessage = await this.queueMessageRepository.createQueueMessage({
      body: enqueueMessageInput.body,
      deadLetterQueueName: enqueueMessageInput.deadLetterQueueName ?? null,
      maxReceiveCount: effectiveMaxReceiveCount,
      messageDeduplicationId: enqueueMessageInput.messageDeduplicationId ?? null,
      messageGroupId: enqueueMessageInput.messageGroupId ?? null,
      queueName: enqueueMessageInput.queueName,
      visibilityExpiresAt,
    })

    return {
      deduplicated: false,
      messageId: queueMessage.id,
      queueName: queueMessage.queueName,
      visibleAt: (queueMessage.visibilityExpiresAt ?? new Date()).toISOString(),
    }
  }

  async receiveMessages(receiveMessagesInput: ReceiveMessagesInput): Promise<ReceiveMessagesResponse> {
    await this.queueMessageRepository.purgeExpiredQueueMessages(
      this.buildRetentionCutoffDate(),
      receiveMessagesInput.queueName
    )
    const claimableAt = new Date()

    await this.queueMessageRepository.normaliseExpiredQueueMessageVisibility(
      claimableAt,
      receiveMessagesInput.queueName
    )

    const candidateLimit = Math.min(100, receiveMessagesInput.maxMessages * 10)
    const visibleCandidates = await this.queueMessageRepository.listVisibleQueueMessages({
      limit: candidateLimit,
      queueName: receiveMessagesInput.queueName,
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
        })
        continue
      }

      if (visibleCandidate.deadLetterQueueName === null
        && visibleCandidate.approximateReceiveCount >= this.queuePolicyConfiguration.poisonMessageReceiveThreshold
      ) {
        await this.queueMessageRepository.deleteQueueMessageById(
          visibleCandidate.id,
          receiveMessagesInput.queueName
        )
        continue
      }

      if (isFifoQueue(receiveMessagesInput.queueName) && visibleCandidate.messageGroupId !== null) {
        const inflightInSameGroup = await this.queueMessageRepository.hasInflightMessageInFifoGroup({
          messageGroupId: visibleCandidate.messageGroupId,
          queueName: receiveMessagesInput.queueName,
          sentTimestampBefore: visibleCandidate.sentTimestamp,
          visibilityExpiresAtAfter: claimableAt,
        })

        if (inflightInSameGroup) {
          continue
        }
      }

      const nextReceiptHandle = this.messageSignatureService.createReceiptHandle()
      const nextVisibilityExpiresAt = this.buildVisibilityExpiryDate(receiveMessagesInput.visibilityTimeoutSeconds)
      const messageClaimed = await this.queueMessageRepository.claimQueueMessageById({
        claimableAt,
        messageId: visibleCandidate.id,
        nextReceiptHandle,
        nextVisibilityExpiresAt,
        queueName: receiveMessagesInput.queueName,
      })

      if (messageClaimed) {
        receivedMessages.push({
          approximateReceiveCount: visibleCandidate.approximateReceiveCount + 1,
          body: visibleCandidate.body,
          messageGroupId: visibleCandidate.messageGroupId ?? undefined,
          messageId: visibleCandidate.id,
          queueName: visibleCandidate.queueName,
          receiptHandle: nextReceiptHandle,
          visibilityExpiresAt: nextVisibilityExpiresAt.toISOString(),
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
