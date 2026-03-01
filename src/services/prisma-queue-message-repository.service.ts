import { Prisma, type PrismaClient } from '@prisma/client'
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
import { PrismaClientService } from '@/services/prisma-client.service'

class PrismaQueueMessageRepositoryService implements QueueMessageRepositoryInterface {
  private mapQueueMessageRecord(queueMessageRecord: {
    approximateReceiveCount: number
    body: Prisma.JsonValue
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
  }): QueueMessageRecord {
    return {
      approximateReceiveCount: queueMessageRecord.approximateReceiveCount,
      body: queueMessageRecord.body,
      currentReceiptHandle: queueMessageRecord.currentReceiptHandle,
      deadLetterQueueName: queueMessageRecord.deadLetterQueueName,
      id: queueMessageRecord.id,
      maxReceiveCount: queueMessageRecord.maxReceiveCount,
      messageDeduplicationId: queueMessageRecord.messageDeduplicationId,
      messageGroupId: queueMessageRecord.messageGroupId,
      queueName: queueMessageRecord.queueName,
      sentTimestamp: queueMessageRecord.sentTimestamp,
      sourceQueueName: queueMessageRecord.sourceQueueName,
      visibilityChangeCount: queueMessageRecord.visibilityChangeCount,
      visibilityExpiresAt: queueMessageRecord.visibilityExpiresAt,
    }
  }

  private get prismaClient(): PrismaClient {
    return this.prismaClientService.getClient()
  }

  constructor(private readonly prismaClientService: PrismaClientService = new PrismaClientService()) {}

  async claimQueueMessageById(claimQueueMessageInput: ClaimQueueMessageInput): Promise<boolean> {
    const updateResult = await this.prismaClient.queueMessage.updateMany({
      data: {
        approximateReceiveCount: {
          increment: 1,
        },
        currentReceiptHandle: claimQueueMessageInput.nextReceiptHandle,
        visibilityExpiresAt: claimQueueMessageInput.nextVisibilityExpiresAt,
      },
      where: {
        id: claimQueueMessageInput.messageId,
        OR: [
          {
            visibilityExpiresAt: null,
          },
          {
            visibilityExpiresAt: {
              lte: claimQueueMessageInput.claimableAt,
            },
          },
        ],
        queueName: claimQueueMessageInput.queueName,
      },
    })

    return updateResult.count === 1
  }

  async createQueueMessage(createQueueMessageInput: CreateQueueMessageInput): Promise<QueueMessageRecord> {
    const queueMessageRecord = await this.prismaClient.queueMessage.create({
      data: {
        body: createQueueMessageInput.body as Prisma.InputJsonValue,
        deadLetterQueueName: createQueueMessageInput.deadLetterQueueName,
        maxReceiveCount: createQueueMessageInput.maxReceiveCount,
        messageDeduplicationId: createQueueMessageInput.messageDeduplicationId,
        messageGroupId: createQueueMessageInput.messageGroupId,
        queueName: createQueueMessageInput.queueName,
        visibilityChangeCount: 0,
        visibilityExpiresAt: createQueueMessageInput.visibilityExpiresAt,
      },
    })

    return this.mapQueueMessageRecord(queueMessageRecord)
  }

  async deleteQueueMessageByReceiptHandle(
    deleteQueueMessageByReceiptHandleInput: DeleteQueueMessageByReceiptHandleInput
  ): Promise<boolean> {
    const deleteResult = await this.prismaClient.queueMessage.deleteMany({
      where: {
        currentReceiptHandle: deleteQueueMessageByReceiptHandleInput.receiptHandle,
        queueName: deleteQueueMessageByReceiptHandleInput.queueName,
        visibilityExpiresAt: {
          gt: deleteQueueMessageByReceiptHandleInput.deleteRequestedAt,
        },
      },
    })

    return deleteResult.count === 1
  }

  async deleteQueueMessageById(messageId: string, queueName: string): Promise<boolean> {
    const deleteResult = await this.prismaClient.queueMessage.deleteMany({
      where: {
        id: messageId,
        queueName,
      },
    })

    return deleteResult.count === 1
  }

  async findRecentMessageByDeduplicationId(
    findRecentMessageByDeduplicationIdInput: FindRecentMessageByDeduplicationIdInput
  ): Promise<QueueMessageRecord | null> {
    const queueMessageRecord = await this.prismaClient.queueMessage.findFirst({
      orderBy: {
        sentTimestamp: 'desc',
      },
      where: {
        messageDeduplicationId: findRecentMessageByDeduplicationIdInput.messageDeduplicationId,
        queueName: findRecentMessageByDeduplicationIdInput.queueName,
        sentTimestamp: {
          gte: findRecentMessageByDeduplicationIdInput.sentAtOrAfter,
        },
      },
    })

    if (queueMessageRecord === null) {
      return null
    }

    return this.mapQueueMessageRecord(queueMessageRecord)
  }

  async getQueueMessageByReceiptHandle(
    getQueueMessageByReceiptHandleInput: GetQueueMessageByReceiptHandleInput
  ): Promise<QueueMessageRecord | null> {
    const queueMessageRecord = await this.prismaClient.queueMessage.findFirst({
      where: {
        currentReceiptHandle: getQueueMessageByReceiptHandleInput.receiptHandle,
        queueName: getQueueMessageByReceiptHandleInput.queueName,
        visibilityExpiresAt: {
          gt: getQueueMessageByReceiptHandleInput.visibleAfter,
        },
      },
    })

    if (queueMessageRecord === null) {
      return null
    }

    return this.mapQueueMessageRecord(queueMessageRecord)
  }

  async hasInflightMessageInFifoGroup(
    hasInflightMessageInFifoGroupInput: HasInflightMessageInFifoGroupInput
  ): Promise<boolean> {
    const inflightMessageCount = await this.prismaClient.queueMessage.count({
      where: {
        messageGroupId: hasInflightMessageInFifoGroupInput.messageGroupId,
        queueName: hasInflightMessageInFifoGroupInput.queueName,
        sentTimestamp: {
          lt: hasInflightMessageInFifoGroupInput.sentTimestampBefore,
        },
        visibilityExpiresAt: {
          gt: hasInflightMessageInFifoGroupInput.visibilityExpiresAtAfter,
        },
      },
    })

    return inflightMessageCount > 0
  }

  async listVisibleQueueMessages(listVisibleQueueMessagesInput: ListVisibleQueueMessagesInput): Promise<QueueMessageRecord[]> {
    const queueMessageRecords = await this.prismaClient.queueMessage.findMany({
      orderBy: {
        sentTimestamp: 'asc',
      },
      take: listVisibleQueueMessagesInput.limit,
      where: {
        OR: [
          {
            visibilityExpiresAt: null,
          },
          {
            visibilityExpiresAt: {
              lte: listVisibleQueueMessagesInput.visibleAtOrBefore,
            },
          },
        ],
        queueName: listVisibleQueueMessagesInput.queueName,
      },
    })

    return queueMessageRecords.map((queueMessageRecord) => {
      return this.mapQueueMessageRecord(queueMessageRecord)
    })
  }

  async normaliseExpiredQueueMessageVisibility(expiredAtOrBefore: Date, queueName: string): Promise<number> {
    const updateResult = await this.prismaClient.queueMessage.updateMany({
      data: {
        currentReceiptHandle: null,
        visibilityExpiresAt: null,
      },
      where: {
        queueName,
        visibilityExpiresAt: {
          lte: expiredAtOrBefore,
        },
      },
    })

    return updateResult.count
  }

  async moveQueueMessageToDeadLetterQueue(
    moveQueueMessageToDeadLetterQueueInput: MoveQueueMessageToDeadLetterQueueInput
  ): Promise<boolean> {
    const updateResult = await this.prismaClient.queueMessage.updateMany({
      data: {
        approximateReceiveCount: 0,
        currentReceiptHandle: null,
        deadLetterQueueName: null,
        maxReceiveCount: null,
        queueName: moveQueueMessageToDeadLetterQueueInput.deadLetterQueueName,
        sourceQueueName: moveQueueMessageToDeadLetterQueueInput.queueName,
        visibilityChangeCount: 0,
        visibilityExpiresAt: null,
      },
      where: {
        id: moveQueueMessageToDeadLetterQueueInput.messageId,
        queueName: moveQueueMessageToDeadLetterQueueInput.queueName,
      },
    })

    return updateResult.count === 1
  }

  async purgeExpiredQueueMessages(olderThanOrEqualTo: Date, queueName: string): Promise<number> {
    const deleteResult = await this.prismaClient.queueMessage.deleteMany({
      where: {
        queueName,
        sentTimestamp: {
          lte: olderThanOrEqualTo,
        },
      },
    })

    return deleteResult.count
  }

  async setQueueMessageVisibilityByReceiptHandle(
    setQueueMessageVisibilityByReceiptHandleInput: SetQueueMessageVisibilityByReceiptHandleInput
  ): Promise<QueueMessageRecord | null> {
    const updateResult = await this.prismaClient.queueMessage.updateMany({
      data: {
        visibilityChangeCount: {
          increment: 1,
        },
        visibilityExpiresAt: setQueueMessageVisibilityByReceiptHandleInput.visibilityExpiresAt,
      },
      where: {
        currentReceiptHandle: setQueueMessageVisibilityByReceiptHandleInput.receiptHandle,
        queueName: setQueueMessageVisibilityByReceiptHandleInput.queueName,
        visibilityExpiresAt: {
          gt: setQueueMessageVisibilityByReceiptHandleInput.visibilitySetRequestedAt,
        },
      },
    })

    if (updateResult.count !== 1) {
      return null
    }

    const queueMessageRecord = await this.prismaClient.queueMessage.findFirst({
      where: {
        currentReceiptHandle: setQueueMessageVisibilityByReceiptHandleInput.receiptHandle,
        queueName: setQueueMessageVisibilityByReceiptHandleInput.queueName,
      },
    })

    if (queueMessageRecord === null) {
      return null
    }

    return this.mapQueueMessageRecord(queueMessageRecord)
  }
}

export { PrismaQueueMessageRepositoryService }
