import { randomUUID } from 'node:crypto'
import {
  type ClaimQueueMessageInput,
  type CreateQueueMessageInput,
  type DeleteQueueMessageByReceiptHandleInput,
  type ListVisibleQueueMessagesInput,
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
    const queueMessageRecord: QueueMessageRecord = {
      body: createQueueMessageInput.body,
      createdAt: new Date(),
      id: randomUUID(),
      queueName: createQueueMessageInput.queueName,
      receiptHandleHash: null,
      receiveCount: 0,
      serviceUserUuid: createQueueMessageInput.serviceUserUuid,
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
