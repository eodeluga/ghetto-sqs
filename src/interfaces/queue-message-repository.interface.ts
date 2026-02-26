interface ClaimQueueMessageInput {
  claimableAt: Date
  messageId: string
  nextReceiptHandleHash: string
  nextVisibleAt: Date
  queueName: string
  serviceUserUuid: string
}

interface CreateQueueMessageInput {
  body: unknown
  deadLetterQueueName: string | null
  maxReceiveCount: number | null
  messageDeduplicationId: string | null
  messageGroupId: string | null
  queueName: string
  serviceUserUuid: string
  visibleAt: Date
}

interface DeleteQueueMessageByReceiptHandleInput {
  messageId: string
  queueName: string
  receiptHandleHash: string
  serviceUserUuid: string
}

interface FindRecentMessageByDeduplicationIdInput {
  createdAtOrAfter: Date
  messageDeduplicationId: string
  queueName: string
  serviceUserUuid: string
}

interface HasInflightMessageInFifoGroupInput {
  createdAtBefore: Date
  messageGroupId: string
  queueName: string
  serviceUserUuid: string
  visibleAtAfter: Date
}

interface ListVisibleQueueMessagesInput {
  limit: number
  queueName: string
  serviceUserUuid: string
  visibleAtOrBefore: Date
}

interface MoveQueueMessageToDeadLetterQueueInput {
  deadLetterQueueName: string
  messageId: string
  queueName: string
  serviceUserUuid: string
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
  serviceUserUuid: string
  sourceQueueName: string | null
  visibleAt: Date
}

interface SetQueueMessageVisibilityByReceiptHandleInput {
  messageId: string
  queueName: string
  receiptHandleHash: string
  serviceUserUuid: string
  visibleAt: Date
}

interface QueueMessageRepositoryInterface {
  claimQueueMessageById(claimQueueMessageInput: ClaimQueueMessageInput): Promise<boolean>
  createQueueMessage(createQueueMessageInput: CreateQueueMessageInput): Promise<QueueMessageRecord>
  deleteQueueMessageByReceiptHandle(
    deleteQueueMessageByReceiptHandleInput: DeleteQueueMessageByReceiptHandleInput
  ): Promise<boolean>
  findRecentMessageByDeduplicationId(
    findRecentMessageByDeduplicationIdInput: FindRecentMessageByDeduplicationIdInput
  ): Promise<QueueMessageRecord | null>
  hasInflightMessageInFifoGroup(
    hasInflightMessageInFifoGroupInput: HasInflightMessageInFifoGroupInput
  ): Promise<boolean>
  listVisibleQueueMessages(listVisibleQueueMessagesInput: ListVisibleQueueMessagesInput): Promise<QueueMessageRecord[]>
  moveQueueMessageToDeadLetterQueue(
    moveQueueMessageToDeadLetterQueueInput: MoveQueueMessageToDeadLetterQueueInput
  ): Promise<boolean>
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
