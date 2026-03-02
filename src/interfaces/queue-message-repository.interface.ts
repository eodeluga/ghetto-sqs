interface ClaimQueueMessageInput {
  claimableAt: Date
  messageId: string
  nextReceiptHandleHash: string
  nextVisibleAt: Date
  queueName: string
}

interface CreateQueueMessageInput {
  body: unknown
  deadLetterQueueName: string | null
  maxReceiveCount: number | null
  messageDeduplicationId: string | null
  messageGroupId: string | null
  queueName: string
  visibleAt: Date
}

interface DeleteQueueMessageByReceiptHandleInput {
  messageId: string
  queueName: string
  receiptHandleHash: string
}

interface FindRecentMessageByDeduplicationIdInput {
  createdAtOrAfter: Date
  messageDeduplicationId: string
  queueName: string
}

interface HasInflightMessageInFifoGroupInput {
  createdAtBefore: Date
  messageGroupId: string
  queueName: string
  visibleAtAfter: Date
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
  body: unknown
  createdAt: Date
  deadLetterQueueName: string | null
  id: string
  maxReceiveCount: number | null
  messageDeduplicationId: string | null
  messageGroupId: string | null
  queueName: string
  receiptHandleHash: string | null
  receiveCount: number
  sourceQueueName: string | null
  visibilityChangeCount: number
  visibleAt: Date
}

interface SetQueueMessageVisibilityByReceiptHandleInput {
  messageId: string
  queueName: string
  receiptHandleHash: string
  visibleAt: Date
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
    messageId: string,
    queueName: string,
    receiptHandleHash: string
  ): Promise<QueueMessageRecord | null>
  hasInflightMessageInFifoGroup(
    hasInflightMessageInFifoGroupInput: HasInflightMessageInFifoGroupInput
  ): Promise<boolean>
  listVisibleQueueMessages(listVisibleQueueMessagesInput: ListVisibleQueueMessagesInput): Promise<QueueMessageRecord[]>
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
  type HasInflightMessageInFifoGroupInput,
  type ListVisibleQueueMessagesInput,
  type MoveQueueMessageToDeadLetterQueueInput,
  type QueueMessageRecord,
  type QueueMessageRepositoryInterface,
  type SetQueueMessageVisibilityByReceiptHandleInput,
}
