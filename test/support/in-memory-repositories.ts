import { randomUUID } from 'node:crypto'
import {
  type ClaimQueueMessageInput,
  type CreateQueueMessageInput,
  type DeleteQueueMessageByReceiptHandleInput,
  type FindRecentMessageByDeduplicationIdInput,
  type GetQueueMessageByReceiptHandleInput,
  type HasInflightMessageInFifoGroupInput,
  type ListVisibleQueueMessagesInput,
  type MoveQueueMessageToDeadLetterQueueInput,
  type QueueMessageRecord,
  type QueueMessageRepositoryInterface,
  type SetQueueMessageVisibilityByReceiptHandleInput,
} from '@/interfaces/queue-message-repository.interface'

class InMemoryQueueMessageRepository implements QueueMessageRepositoryInterface {
  private nextSentTimestampMs = Date.now()

  private readonly queueMessagesById = new Map<string, QueueMessageRecord>()

  private cloneQueueMessageRecord(queueMessageRecord: QueueMessageRecord): QueueMessageRecord {
    return {
      ...queueMessageRecord,
      sentTimestamp: new Date(queueMessageRecord.sentTimestamp.getTime()),
      visibilityExpiresAt: queueMessageRecord.visibilityExpiresAt === null
        ? null
        : new Date(queueMessageRecord.visibilityExpiresAt.getTime()),
    }
  }

  claimQueueMessageById(claimQueueMessageInput: ClaimQueueMessageInput): Promise<boolean> {
    const messageRecord = this.queueMessagesById.get(claimQueueMessageInput.messageId)

    if (messageRecord === undefined) {
      return Promise.resolve(false)
    }

    const currentlyVisible = messageRecord.visibilityExpiresAt === null
      || messageRecord.visibilityExpiresAt <= claimQueueMessageInput.claimableAt

    if (!currentlyVisible || messageRecord.queueName !== claimQueueMessageInput.queueName) {
      return Promise.resolve(false)
    }

    messageRecord.approximateReceiveCount += 1
    messageRecord.currentReceiptHandle = claimQueueMessageInput.nextReceiptHandle
    messageRecord.visibilityExpiresAt = claimQueueMessageInput.nextVisibilityExpiresAt
    this.queueMessagesById.set(messageRecord.id, messageRecord)

    return Promise.resolve(true)
  }

  createQueueMessage(createQueueMessageInput: CreateQueueMessageInput): Promise<QueueMessageRecord> {
    const sentTimestamp = new Date(this.nextSentTimestampMs)

    this.nextSentTimestampMs += 1

    const queueMessageRecord: QueueMessageRecord = {
      approximateReceiveCount: 0,
      body: createQueueMessageInput.body,
      currentReceiptHandle: null,
      deadLetterQueueName: createQueueMessageInput.deadLetterQueueName,
      id: randomUUID(),
      maxReceiveCount: createQueueMessageInput.maxReceiveCount,
      messageDeduplicationId: createQueueMessageInput.messageDeduplicationId,
      messageGroupId: createQueueMessageInput.messageGroupId,
      queueName: createQueueMessageInput.queueName,
      sentTimestamp,
      sourceQueueName: null,
      visibilityChangeCount: 0,
      visibilityExpiresAt: createQueueMessageInput.visibilityExpiresAt,
    }

    this.queueMessagesById.set(queueMessageRecord.id, queueMessageRecord)

    return Promise.resolve(this.cloneQueueMessageRecord(queueMessageRecord))
  }

  deleteQueueMessageById(messageId: string, queueName: string): Promise<boolean> {
    const messageRecord = this.queueMessagesById.get(messageId)

    if (messageRecord === undefined || messageRecord.queueName !== queueName) {
      return Promise.resolve(false)
    }

    this.queueMessagesById.delete(messageId)

    return Promise.resolve(true)
  }

  deleteQueueMessageByReceiptHandle(
    deleteQueueMessageByReceiptHandleInput: DeleteQueueMessageByReceiptHandleInput
  ): Promise<boolean> {
    const matchingMessageRecord = [...this.queueMessagesById.values()].find((queueMessageRecord) => {
      return queueMessageRecord.currentReceiptHandle === deleteQueueMessageByReceiptHandleInput.receiptHandle
        && queueMessageRecord.queueName === deleteQueueMessageByReceiptHandleInput.queueName
        && queueMessageRecord.visibilityExpiresAt !== null
        && queueMessageRecord.visibilityExpiresAt > deleteQueueMessageByReceiptHandleInput.deleteRequestedAt
    })

    if (matchingMessageRecord === undefined) {
      return Promise.resolve(false)
    }

    this.queueMessagesById.delete(matchingMessageRecord.id)

    return Promise.resolve(true)
  }

  findRecentMessageByDeduplicationId(
    findRecentMessageByDeduplicationIdInput: FindRecentMessageByDeduplicationIdInput
  ): Promise<QueueMessageRecord | null> {
    const recentMatchingMessage = [...this.queueMessagesById.values()]
      .filter((queueMessageRecord) => {
        return queueMessageRecord.messageDeduplicationId === findRecentMessageByDeduplicationIdInput.messageDeduplicationId
          && queueMessageRecord.queueName === findRecentMessageByDeduplicationIdInput.queueName
          && queueMessageRecord.sentTimestamp >= findRecentMessageByDeduplicationIdInput.sentAtOrAfter
      })
      .sort((leftRecord, rightRecord) => {
        return rightRecord.sentTimestamp.getTime() - leftRecord.sentTimestamp.getTime()
      })
      .at(0)

    if (recentMatchingMessage === undefined) {
      return Promise.resolve(null)
    }

    return Promise.resolve(this.cloneQueueMessageRecord(recentMatchingMessage))
  }

  getQueueMessageByReceiptHandle(
    getQueueMessageByReceiptHandleInput: GetQueueMessageByReceiptHandleInput
  ): Promise<QueueMessageRecord | null> {
    const messageRecord = [...this.queueMessagesById.values()].find((queueMessageRecord) => {
      return queueMessageRecord.currentReceiptHandle === getQueueMessageByReceiptHandleInput.receiptHandle
        && queueMessageRecord.queueName === getQueueMessageByReceiptHandleInput.queueName
        && queueMessageRecord.visibilityExpiresAt !== null
        && queueMessageRecord.visibilityExpiresAt > getQueueMessageByReceiptHandleInput.visibleAfter
    })

    if (messageRecord === undefined) {
      return Promise.resolve(null)
    }

    return Promise.resolve(this.cloneQueueMessageRecord(messageRecord))
  }

  hasInflightMessageInFifoGroup(
    hasInflightMessageInFifoGroupInput: HasInflightMessageInFifoGroupInput
  ): Promise<boolean> {
    const hasInflightMessage = [...this.queueMessagesById.values()].some((queueMessageRecord) => {
      return queueMessageRecord.messageGroupId === hasInflightMessageInFifoGroupInput.messageGroupId
        && queueMessageRecord.queueName === hasInflightMessageInFifoGroupInput.queueName
        && queueMessageRecord.sentTimestamp < hasInflightMessageInFifoGroupInput.sentTimestampBefore
        && queueMessageRecord.visibilityExpiresAt !== null
        && queueMessageRecord.visibilityExpiresAt > hasInflightMessageInFifoGroupInput.visibilityExpiresAtAfter
    })

    return Promise.resolve(hasInflightMessage)
  }

  listVisibleQueueMessages(listVisibleQueueMessagesInput: ListVisibleQueueMessagesInput): Promise<QueueMessageRecord[]> {
    const visibleQueueMessages = [...this.queueMessagesById.values()]
      .filter((queueMessageRecord) => {
        return queueMessageRecord.queueName === listVisibleQueueMessagesInput.queueName
          && (
            queueMessageRecord.visibilityExpiresAt === null
            || queueMessageRecord.visibilityExpiresAt <= listVisibleQueueMessagesInput.visibleAtOrBefore
          )
      })
      .sort((leftRecord, rightRecord) => {
        return leftRecord.sentTimestamp.getTime() - rightRecord.sentTimestamp.getTime()
      })
      .slice(0, listVisibleQueueMessagesInput.limit)

    return Promise.resolve(visibleQueueMessages.map((queueMessageRecord) => {
      return this.cloneQueueMessageRecord(queueMessageRecord)
    }))
  }

  normaliseExpiredQueueMessageVisibility(expiredAtOrBefore: Date, queueName: string): Promise<number> {
    let updatedRecordCount = 0

    for (const queueMessageRecord of this.queueMessagesById.values()) {
      if (
        queueMessageRecord.queueName === queueName
        && queueMessageRecord.visibilityExpiresAt !== null
        && queueMessageRecord.visibilityExpiresAt <= expiredAtOrBefore
      ) {
        queueMessageRecord.currentReceiptHandle = null
        queueMessageRecord.visibilityExpiresAt = null
        this.queueMessagesById.set(queueMessageRecord.id, queueMessageRecord)
        updatedRecordCount += 1
      }
    }

    return Promise.resolve(updatedRecordCount)
  }

  moveQueueMessageToDeadLetterQueue(
    moveQueueMessageToDeadLetterQueueInput: MoveQueueMessageToDeadLetterQueueInput
  ): Promise<boolean> {
    const messageRecord = this.queueMessagesById.get(moveQueueMessageToDeadLetterQueueInput.messageId)

    if (messageRecord === undefined || messageRecord.queueName !== moveQueueMessageToDeadLetterQueueInput.queueName) {
      return Promise.resolve(false)
    }

    messageRecord.approximateReceiveCount = 0
    messageRecord.currentReceiptHandle = null
    messageRecord.deadLetterQueueName = null
    messageRecord.maxReceiveCount = null
    messageRecord.queueName = moveQueueMessageToDeadLetterQueueInput.deadLetterQueueName
    messageRecord.sourceQueueName = moveQueueMessageToDeadLetterQueueInput.queueName
    messageRecord.visibilityChangeCount = 0
    messageRecord.visibilityExpiresAt = null
    this.queueMessagesById.set(messageRecord.id, messageRecord)

    return Promise.resolve(true)
  }

  purgeExpiredQueueMessages(olderThanOrEqualTo: Date, queueName: string): Promise<number> {
    const removableMessageIds = [...this.queueMessagesById.values()]
      .filter((queueMessageRecord) => {
        return queueMessageRecord.queueName === queueName && queueMessageRecord.sentTimestamp <= olderThanOrEqualTo
      })
      .map((queueMessageRecord) => {
        return queueMessageRecord.id
      })

    removableMessageIds.forEach((messageId) => {
      this.queueMessagesById.delete(messageId)
    })

    return Promise.resolve(removableMessageIds.length)
  }

  setQueueMessageVisibilityByReceiptHandle(
    setQueueMessageVisibilityByReceiptHandleInput: SetQueueMessageVisibilityByReceiptHandleInput
  ): Promise<QueueMessageRecord | null> {
    const messageRecord = [...this.queueMessagesById.values()].find((queueMessageRecord) => {
      return queueMessageRecord.currentReceiptHandle === setQueueMessageVisibilityByReceiptHandleInput.receiptHandle
        && queueMessageRecord.queueName === setQueueMessageVisibilityByReceiptHandleInput.queueName
        && queueMessageRecord.visibilityExpiresAt !== null
        && queueMessageRecord.visibilityExpiresAt > setQueueMessageVisibilityByReceiptHandleInput.visibilitySetRequestedAt
    })

    if (messageRecord === undefined) {
      return Promise.resolve(null)
    }

    messageRecord.visibilityChangeCount += 1
    messageRecord.visibilityExpiresAt = setQueueMessageVisibilityByReceiptHandleInput.visibilityExpiresAt
    this.queueMessagesById.set(messageRecord.id, messageRecord)

    return Promise.resolve(this.cloneQueueMessageRecord(messageRecord))
  }
}

export { InMemoryQueueMessageRepository }
