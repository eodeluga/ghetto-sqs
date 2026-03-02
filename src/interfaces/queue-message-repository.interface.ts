interface ClaimQueueMessageInput {
  claimableAt: Date
  messageId: string
  nextReceiptHandle: string
  nextVisibilityExpiresAt: Date
  queueName: string
}

interface CreateQueueMessageInput {
  body: unknown
  deadLetterQueueName: string | null
  maxReceiveCount: number | null
  messageDeduplicationId: string | null
  messageGroupId: string | null
  queueName: string
  visibilityExpiresAt: Date | null
}

interface DeleteQueueMessageByReceiptHandleInput {
  deleteRequestedAt: Date
  queueName: string
  receiptHandle: string
}

interface FindRecentMessageByDeduplicationIdInput {
  messageDeduplicationId: string
  queueName: string
  sentAtOrAfter: Date
}

interface GetQueueMessageByReceiptHandleInput {
  queueName: string
  receiptHandle: string
  visibleAfter: Date
}

interface HasInflightMessageInFifoGroupInput {
  messageGroupId: string
  queueName: string
  sentTimestampBefore: Date
  visibilityExpiresAtAfter: Date
}

interface ListVisibleQueueMessagesInput {
  limit: number
  queueName: string
  visibleAtOrBefore: Date
}

interface MoveQueueMessageToDeadLetterQueueInput {
  deadLetterQueueName: string
  messageId: string
  queueName: string
}

interface QueueMessageRecord {
  approximateReceiveCount: number
  body: unknown
  currentReceiptHandle: string | null
  deadLetterQueueName: string | null
  id: string
  maxReceiveCount: number | null
  messageDeduplicationId: string | null
  messageGroupId: string | null
  queueName: string
  sentTimestamp: Date
  sourceQueueName: string | null
  visibilityChangeCount: number
  visibilityExpiresAt: Date | null
}

interface SetQueueMessageVisibilityByReceiptHandleInput {
  queueName: string
  receiptHandle: string
  visibilityExpiresAt: Date
  visibilitySetRequestedAt: Date
}

interface QueueMessageRepositoryInterface {
  claimQueueMessageById(claimQueueMessageInput: ClaimQueueMessageInput): Promise<boolean>
  createQueueMessage(createQueueMessageInput: CreateQueueMessageInput): Promise<QueueMessageRecord>
  deleteQueueMessageById(messageId: string, queueName: string): Promise<boolean>
  deleteQueueMessageByReceiptHandle(
    deleteQueueMessageByReceiptHandleInput: DeleteQueueMessageByReceiptHandleInput
  ): Promise<boolean>
  findRecentMessageByDeduplicationId(
    findRecentMessageByDeduplicationIdInput: FindRecentMessageByDeduplicationIdInput
  ): Promise<QueueMessageRecord | null>
  getQueueMessageByReceiptHandle(
    getQueueMessageByReceiptHandleInput: GetQueueMessageByReceiptHandleInput
  ): Promise<QueueMessageRecord | null>
  hasInflightMessageInFifoGroup(
    hasInflightMessageInFifoGroupInput: HasInflightMessageInFifoGroupInput
  ): Promise<boolean>
  listVisibleQueueMessages(listVisibleQueueMessagesInput: ListVisibleQueueMessagesInput): Promise<QueueMessageRecord[]>
  normaliseExpiredQueueMessageVisibility(expiredAtOrBefore: Date, queueName: string): Promise<number>
  moveQueueMessageToDeadLetterQueue(
    moveQueueMessageToDeadLetterQueueInput: MoveQueueMessageToDeadLetterQueueInput
  ): Promise<boolean>
  purgeExpiredQueueMessages(olderThanOrEqualTo: Date, queueName: string): Promise<number>
  setQueueMessageVisibilityByReceiptHandle(
    setQueueMessageVisibilityByReceiptHandleInput: SetQueueMessageVisibilityByReceiptHandleInput
  ): Promise<QueueMessageRecord | null>
}

export {
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
}
