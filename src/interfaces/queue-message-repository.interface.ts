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

interface ListVisibleQueueMessagesInput {
  limit: number
  queueName: string
  serviceUserUuid: string
  visibleAtOrBefore: Date
}

interface QueueMessageRecord {
  body: unknown
  createdAt: Date
  id: string
  queueName: string
  receiptHandleHash: string | null
  receiveCount: number
  serviceUserUuid: string
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
  listVisibleQueueMessages(listVisibleQueueMessagesInput: ListVisibleQueueMessagesInput): Promise<QueueMessageRecord[]>
  setQueueMessageVisibilityByReceiptHandle(
    setQueueMessageVisibilityByReceiptHandleInput: SetQueueMessageVisibilityByReceiptHandleInput
  ): Promise<QueueMessageRecord | null>
}

export {
  type ClaimQueueMessageInput,
  type CreateQueueMessageInput,
  type DeleteQueueMessageByReceiptHandleInput,
  type ListVisibleQueueMessagesInput,
  type QueueMessageRecord,
  type QueueMessageRepositoryInterface,
  type SetQueueMessageVisibilityByReceiptHandleInput,
}
