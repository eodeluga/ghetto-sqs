import { randomUUID } from 'node:crypto'
import {
  type ClaimQueueMessageInput,
  type CreateQueueMessageInput,
  type DeleteQueueMessageByReceiptHandleInput,
  type FindRecentMessageByDeduplicationIdInput,
  type HasInflightMessageInFifoGroupInput,
  type ListVisibleQueueMessagesInput,
  type MoveQueueMessageToDeadLetterQueueInput,
  type QueueMessageRecord,
  type QueueMessageRepositoryInterface,
  type SetQueueMessageVisibilityByReceiptHandleInput,
} from '@/interfaces/queue-message-repository.interface'
import {
  type CreateServiceHandleInput,
  type ServiceHandleRecord,
  type ServiceHandleRepositoryInterface,
} from '@/interfaces/service-handle-repository.interface'

class InMemoryServiceHandleRepository implements ServiceHandleRepositoryInterface {
  private readonly serviceHandlesByUserUuid = new Map<string, ServiceHandleRecord>()

  createServiceHandle(createServiceHandleInput: CreateServiceHandleInput): Promise<ServiceHandleRecord> {
    const serviceHandleRecord: ServiceHandleRecord = {
      createdAt: new Date(),
      defaultMaxReceiveCount: createServiceHandleInput.defaultMaxReceiveCount,
      defaultVisibilityTimeoutSeconds: createServiceHandleInput.defaultVisibilityTimeoutSeconds,
      id: randomUUID(),
      label: createServiceHandleInput.label,
      signingKey: createServiceHandleInput.signingKey,
      signingKeyHash: createServiceHandleInput.signingKeyHash,
      userUuid: createServiceHandleInput.userUuid,
    }

    this.serviceHandlesByUserUuid.set(serviceHandleRecord.userUuid, serviceHandleRecord)

    return Promise.resolve(serviceHandleRecord)
  }

  getServiceHandleByUserUuid(userUuid: string): Promise<ServiceHandleRecord | null> {
    const serviceHandleRecord = this.serviceHandlesByUserUuid.get(userUuid)

    if (serviceHandleRecord === undefined) {
      return Promise.resolve(null)
    }

    return Promise.resolve(serviceHandleRecord)
  }
}

class InMemoryQueueMessageRepository implements QueueMessageRepositoryInterface {
  private nextCreatedAtTimestampMs = Date.now()

  private readonly queueMessagesById = new Map<string, QueueMessageRecord>()

  claimQueueMessageById(claimQueueMessageInput: ClaimQueueMessageInput): Promise<boolean> {
    const messageRecord = this.queueMessagesById.get(claimQueueMessageInput.messageId)

    if (messageRecord === undefined) {
      return Promise.resolve(false)
    }

    if (messageRecord.queueName !== claimQueueMessageInput.queueName || messageRecord.serviceUserUuid !== claimQueueMessageInput.serviceUserUuid) {
      return Promise.resolve(false)
    }

    if (messageRecord.visibleAt > claimQueueMessageInput.claimableAt) {
      return Promise.resolve(false)
    }

    messageRecord.receiptHandleHash = claimQueueMessageInput.nextReceiptHandleHash
    messageRecord.receiveCount += 1
    messageRecord.visibleAt = claimQueueMessageInput.nextVisibleAt
    this.queueMessagesById.set(messageRecord.id, messageRecord)

    return Promise.resolve(true)
  }

  createQueueMessage(createQueueMessageInput: CreateQueueMessageInput): Promise<QueueMessageRecord> {
    const createdAt = new Date(this.nextCreatedAtTimestampMs)
    this.nextCreatedAtTimestampMs += 1
    const queueMessageRecord: QueueMessageRecord = {
      body: createQueueMessageInput.body,
      createdAt,
      deadLetterQueueName: createQueueMessageInput.deadLetterQueueName,
      id: randomUUID(),
      maxReceiveCount: createQueueMessageInput.maxReceiveCount,
      messageDeduplicationId: createQueueMessageInput.messageDeduplicationId,
      messageGroupId: createQueueMessageInput.messageGroupId,
      queueName: createQueueMessageInput.queueName,
      receiptHandleHash: null,
      receiveCount: 0,
      serviceUserUuid: createQueueMessageInput.serviceUserUuid,
      sourceQueueName: null,
      visibleAt: createQueueMessageInput.visibleAt,
    }

    this.queueMessagesById.set(queueMessageRecord.id, queueMessageRecord)

    return Promise.resolve(queueMessageRecord)
  }

  deleteQueueMessageByReceiptHandle(
    deleteQueueMessageByReceiptHandleInput: DeleteQueueMessageByReceiptHandleInput,
  ): Promise<boolean> {
    const messageRecord = this.queueMessagesById.get(deleteQueueMessageByReceiptHandleInput.messageId)

    if (messageRecord === undefined) {
      return Promise.resolve(false)
    }

    if (
      messageRecord.queueName !== deleteQueueMessageByReceiptHandleInput.queueName
      || messageRecord.receiptHandleHash !== deleteQueueMessageByReceiptHandleInput.receiptHandleHash
      || messageRecord.serviceUserUuid !== deleteQueueMessageByReceiptHandleInput.serviceUserUuid
    ) {
      return Promise.resolve(false)
    }

    this.queueMessagesById.delete(deleteQueueMessageByReceiptHandleInput.messageId)

    return Promise.resolve(true)
  }

  findRecentMessageByDeduplicationId(
    findRecentMessageByDeduplicationIdInput: FindRecentMessageByDeduplicationIdInput,
  ): Promise<QueueMessageRecord | null> {
    const recentMatchingMessage = [...this.queueMessagesById.values()]
      .filter((queueMessageRecord) => {
        return queueMessageRecord.createdAt >= findRecentMessageByDeduplicationIdInput.createdAtOrAfter
          && queueMessageRecord.messageDeduplicationId === findRecentMessageByDeduplicationIdInput.messageDeduplicationId
          && queueMessageRecord.queueName === findRecentMessageByDeduplicationIdInput.queueName
          && queueMessageRecord.serviceUserUuid === findRecentMessageByDeduplicationIdInput.serviceUserUuid
      })
      .sort((leftRecord, rightRecord) => {
        return rightRecord.createdAt.getTime() - leftRecord.createdAt.getTime()
      })
      .at(0)

    return Promise.resolve(recentMatchingMessage ?? null)
  }

  hasInflightMessageInFifoGroup(
    hasInflightMessageInFifoGroupInput: HasInflightMessageInFifoGroupInput,
  ): Promise<boolean> {
    const hasInflightMessage = [...this.queueMessagesById.values()].some((queueMessageRecord) => {
      return queueMessageRecord.createdAt < hasInflightMessageInFifoGroupInput.createdAtBefore
        && queueMessageRecord.messageGroupId === hasInflightMessageInFifoGroupInput.messageGroupId
        && queueMessageRecord.queueName === hasInflightMessageInFifoGroupInput.queueName
        && queueMessageRecord.serviceUserUuid === hasInflightMessageInFifoGroupInput.serviceUserUuid
        && queueMessageRecord.visibleAt > hasInflightMessageInFifoGroupInput.visibleAtAfter
    })

    return Promise.resolve(hasInflightMessage)
  }

  listVisibleQueueMessages(listVisibleQueueMessagesInput: ListVisibleQueueMessagesInput): Promise<QueueMessageRecord[]> {
    const visibleQueueMessages = [...this.queueMessagesById.values()]
      .filter((queueMessageRecord) => {
        return queueMessageRecord.queueName === listVisibleQueueMessagesInput.queueName
          && queueMessageRecord.serviceUserUuid === listVisibleQueueMessagesInput.serviceUserUuid
          && queueMessageRecord.visibleAt <= listVisibleQueueMessagesInput.visibleAtOrBefore
      })
      .sort((leftRecord, rightRecord) => {
        return leftRecord.createdAt.getTime() - rightRecord.createdAt.getTime()
      })
      .slice(0, listVisibleQueueMessagesInput.limit)

    return Promise.resolve(visibleQueueMessages)
  }

  moveQueueMessageToDeadLetterQueue(
    moveQueueMessageToDeadLetterQueueInput: MoveQueueMessageToDeadLetterQueueInput,
  ): Promise<boolean> {
    const messageRecord = this.queueMessagesById.get(moveQueueMessageToDeadLetterQueueInput.messageId)

    if (messageRecord === undefined) {
      return Promise.resolve(false)
    }

    if (
      messageRecord.queueName !== moveQueueMessageToDeadLetterQueueInput.queueName
      || messageRecord.serviceUserUuid !== moveQueueMessageToDeadLetterQueueInput.serviceUserUuid
    ) {
      return Promise.resolve(false)
    }

    messageRecord.deadLetterQueueName = null
    messageRecord.maxReceiveCount = null
    messageRecord.queueName = moveQueueMessageToDeadLetterQueueInput.deadLetterQueueName
    messageRecord.receiptHandleHash = null
    messageRecord.receiveCount = 0
    messageRecord.sourceQueueName = moveQueueMessageToDeadLetterQueueInput.queueName
    messageRecord.visibleAt = new Date()

    this.queueMessagesById.set(messageRecord.id, messageRecord)

    return Promise.resolve(true)
  }

  setQueueMessageVisibilityByReceiptHandle(
    setQueueMessageVisibilityByReceiptHandleInput: SetQueueMessageVisibilityByReceiptHandleInput,
  ): Promise<QueueMessageRecord | null> {
    const messageRecord = this.queueMessagesById.get(setQueueMessageVisibilityByReceiptHandleInput.messageId)

    if (messageRecord === undefined) {
      return Promise.resolve(null)
    }

    if (
      messageRecord.queueName !== setQueueMessageVisibilityByReceiptHandleInput.queueName
      || messageRecord.receiptHandleHash !== setQueueMessageVisibilityByReceiptHandleInput.receiptHandleHash
      || messageRecord.serviceUserUuid !== setQueueMessageVisibilityByReceiptHandleInput.serviceUserUuid
    ) {
      return Promise.resolve(null)
    }

    messageRecord.visibleAt = setQueueMessageVisibilityByReceiptHandleInput.visibleAt
    this.queueMessagesById.set(messageRecord.id, messageRecord)

    return Promise.resolve(messageRecord)
  }
}

export { InMemoryQueueMessageRepository, InMemoryServiceHandleRepository }
