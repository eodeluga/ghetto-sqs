import { randomUUID } from 'node:crypto'
import { AlreadyRegisteredError } from '@/errors'
import {
  type CreateAuditEventInput,
  type RequestSecurityRepositoryInterface,
  type StoreSignedRequestNonceInput,
} from '@/interfaces/request-security-repository.interface'
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
  type RotateServiceSigningKeyInput,
  type ServiceHandleRecord,
  type ServiceHandleRepositoryInterface,
  type ServiceSigningKeyRecord,
} from '@/interfaces/service-handle-repository.interface'

class InMemoryServiceHandleRepository implements ServiceHandleRepositoryInterface {
  private readonly serviceSigningKeysByUserUuid = new Map<string, ServiceSigningKeyRecord[]>()

  private readonly serviceHandlesByLabel = new Map<string, ServiceHandleRecord>()

  private readonly serviceHandlesByUserUuid = new Map<string, ServiceHandleRecord>()

  createServiceHandle(createServiceHandleInput: CreateServiceHandleInput): Promise<ServiceHandleRecord> {
    if (this.serviceHandlesByLabel.has(createServiceHandleInput.label)) {
      throw new AlreadyRegisteredError('Service handle label is already registered', undefined, ['body', 'label'])
    }

    const serviceHandleRecord: ServiceHandleRecord = {
      activeKeyVersion: createServiceHandleInput.activeKeyVersion,
      createdAt: new Date(),
      defaultMaxReceiveCount: createServiceHandleInput.defaultMaxReceiveCount,
      defaultVisibilityTimeoutSeconds: createServiceHandleInput.defaultVisibilityTimeoutSeconds,
      id: randomUUID(),
      label: createServiceHandleInput.label,
      revokedAt: null,
      userUuid: createServiceHandleInput.userUuid,
    }
    const serviceSigningKeyRecord: ServiceSigningKeyRecord = {
      createdAt: new Date(),
      encryptedSigningKey: createServiceHandleInput.encryptedSigningKey,
      id: randomUUID(),
      keyVersion: createServiceHandleInput.keyVersion,
      revokedAt: null,
      serviceUserUuid: createServiceHandleInput.userUuid,
    }

    this.serviceHandlesByLabel.set(serviceHandleRecord.label, serviceHandleRecord)
    this.serviceHandlesByUserUuid.set(serviceHandleRecord.userUuid, serviceHandleRecord)
    this.serviceSigningKeysByUserUuid.set(serviceHandleRecord.userUuid, [serviceSigningKeyRecord])

    return Promise.resolve(serviceHandleRecord)
  }

  getServiceHandleByLabel(label: string): Promise<ServiceHandleRecord | null> {
    const serviceHandleRecord = this.serviceHandlesByLabel.get(label)

    if (serviceHandleRecord === undefined) {
      return Promise.resolve(null)
    }

    return Promise.resolve(serviceHandleRecord)
  }

  getServiceHandleByUserUuid(userUuid: string): Promise<ServiceHandleRecord | null> {
    const serviceHandleRecord = this.serviceHandlesByUserUuid.get(userUuid)

    if (serviceHandleRecord === undefined) {
      return Promise.resolve(null)
    }

    return Promise.resolve(serviceHandleRecord)
  }

  getUnrevokedSigningKeysByUserUuid(userUuid: string): Promise<ServiceSigningKeyRecord[]> {
    const serviceSigningKeyRecords = this.serviceSigningKeysByUserUuid.get(userUuid) ?? []
    const unrevokedServiceSigningKeyRecords = serviceSigningKeyRecords
      .filter((serviceSigningKeyRecord) => {
        return serviceSigningKeyRecord.revokedAt === null
      })
      .sort((leftRecord, rightRecord) => {
        return rightRecord.keyVersion - leftRecord.keyVersion
      })

    return Promise.resolve(unrevokedServiceSigningKeyRecords)
  }

  revokeServiceHandle(userUuid: string): Promise<Date | null> {
    const serviceHandleRecord = this.serviceHandlesByUserUuid.get(userUuid)

    if (serviceHandleRecord === undefined || serviceHandleRecord.revokedAt !== null) {
      return Promise.resolve(null)
    }

    const revokedAt = new Date()

    serviceHandleRecord.revokedAt = revokedAt
    this.serviceHandlesByUserUuid.set(userUuid, serviceHandleRecord)
    this.serviceHandlesByLabel.set(serviceHandleRecord.label, serviceHandleRecord)
    const serviceSigningKeyRecords = this.serviceSigningKeysByUserUuid.get(userUuid) ?? []

    serviceSigningKeyRecords.forEach((serviceSigningKeyRecord) => {
      if (serviceSigningKeyRecord.revokedAt === null) {
        serviceSigningKeyRecord.revokedAt = revokedAt
      }
    })
    this.serviceSigningKeysByUserUuid.set(userUuid, serviceSigningKeyRecords)

    return Promise.resolve(revokedAt)
  }

  rotateServiceSigningKey(rotateServiceSigningKeyInput: RotateServiceSigningKeyInput): Promise<ServiceSigningKeyRecord> {
    const serviceHandleRecord = this.serviceHandlesByUserUuid.get(rotateServiceSigningKeyInput.serviceUserUuid)

    if (serviceHandleRecord === undefined || serviceHandleRecord.revokedAt !== null) {
      throw new Error('Cannot rotate signing key for a missing or revoked service handle')
    }

    const serviceSigningKeyRecords = this.serviceSigningKeysByUserUuid.get(rotateServiceSigningKeyInput.serviceUserUuid) ?? []
    const nextKeyVersion = serviceHandleRecord.activeKeyVersion + 1
    const rotatedSigningKeyRecord: ServiceSigningKeyRecord = {
      createdAt: new Date(),
      encryptedSigningKey: rotateServiceSigningKeyInput.encryptedSigningKey,
      id: randomUUID(),
      keyVersion: nextKeyVersion,
      revokedAt: null,
      serviceUserUuid: rotateServiceSigningKeyInput.serviceUserUuid,
    }

    serviceHandleRecord.activeKeyVersion = nextKeyVersion
    this.serviceHandlesByUserUuid.set(serviceHandleRecord.userUuid, serviceHandleRecord)
    this.serviceHandlesByLabel.set(serviceHandleRecord.label, serviceHandleRecord)
    serviceSigningKeyRecords.forEach((serviceSigningKeyRecord) => {
      if (serviceSigningKeyRecord.revokedAt === null) {
        serviceSigningKeyRecord.revokedAt = new Date()
      }
    })
    serviceSigningKeyRecords.push(rotatedSigningKeyRecord)
    this.serviceSigningKeysByUserUuid.set(rotateServiceSigningKeyInput.serviceUserUuid, serviceSigningKeyRecords)

    return Promise.resolve(rotatedSigningKeyRecord)
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
      visibilityChangeCount: 0,
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

  deleteQueueMessageById(messageId: string, queueName: string, serviceUserUuid: string): Promise<boolean> {
    const messageRecord = this.queueMessagesById.get(messageId)

    if (messageRecord === undefined) {
      return Promise.resolve(false)
    }

    if (messageRecord.queueName !== queueName || messageRecord.serviceUserUuid !== serviceUserUuid) {
      return Promise.resolve(false)
    }

    this.queueMessagesById.delete(messageId)

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

  getQueueMessageByReceiptHandle(
    messageId: string,
    queueName: string,
    receiptHandleHash: string,
    serviceUserUuid: string
  ): Promise<QueueMessageRecord | null> {
    const messageRecord = this.queueMessagesById.get(messageId)

    if (messageRecord === undefined) {
      return Promise.resolve(null)
    }

    if (
      messageRecord.queueName !== queueName
      || messageRecord.receiptHandleHash !== receiptHandleHash
      || messageRecord.serviceUserUuid !== serviceUserUuid
    ) {
      return Promise.resolve(null)
    }

    return Promise.resolve(messageRecord)
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

  purgeExpiredQueueMessages(olderThanOrEqualTo: Date, queueName: string, serviceUserUuid: string): Promise<number> {
    const removableMessageIds = [...this.queueMessagesById.values()]
      .filter((queueMessageRecord) => {
        return queueMessageRecord.createdAt <= olderThanOrEqualTo
          && queueMessageRecord.queueName === queueName
          && queueMessageRecord.serviceUserUuid === serviceUserUuid
      })
      .map((queueMessageRecord) => {
        return queueMessageRecord.id
      })

    removableMessageIds.forEach((messageId) => {
      this.queueMessagesById.delete(messageId)
    })

    return Promise.resolve(removableMessageIds.length)
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
    messageRecord.visibilityChangeCount = 0
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
    messageRecord.visibilityChangeCount += 1
    this.queueMessagesById.set(messageRecord.id, messageRecord)

    return Promise.resolve(messageRecord)
  }
}

class InMemoryRequestSecurityRepository implements RequestSecurityRepositoryInterface {
  private readonly auditEvents: CreateAuditEventInput[] = []

  private readonly noncesByServiceUserUuid = new Map<string, Map<string, Date>>()

  createAuditEvent(createAuditEventInput: CreateAuditEventInput): Promise<void> {
    this.auditEvents.push(createAuditEventInput)

    return Promise.resolve()
  }

  deleteExpiredSignedRequestNonces(expiredAtOrBefore: Date): Promise<number> {
    let deletedCount = 0

    this.noncesByServiceUserUuid.forEach((noncesByValue) => {
      noncesByValue.forEach((expiresAt, nonceValue) => {
        if (expiresAt <= expiredAtOrBefore) {
          noncesByValue.delete(nonceValue)
          deletedCount += 1
        }
      })
    })

    return Promise.resolve(deletedCount)
  }

  storeSignedRequestNonce(storeSignedRequestNonceInput: StoreSignedRequestNonceInput): Promise<boolean> {
    const noncesByValue = this.noncesByServiceUserUuid.get(storeSignedRequestNonceInput.serviceUserUuid)
      ?? new Map<string, Date>()

    if (noncesByValue.has(storeSignedRequestNonceInput.nonce)) {
      return Promise.resolve(false)
    }

    noncesByValue.set(storeSignedRequestNonceInput.nonce, storeSignedRequestNonceInput.expiresAt)
    this.noncesByServiceUserUuid.set(storeSignedRequestNonceInput.serviceUserUuid, noncesByValue)

    return Promise.resolve(true)
  }
}

export { InMemoryQueueMessageRepository, InMemoryRequestSecurityRepository, InMemoryServiceHandleRepository }
