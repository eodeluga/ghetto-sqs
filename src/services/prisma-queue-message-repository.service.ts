import { Prisma, type PrismaClient } from '@prisma/client'
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
import { PrismaClientService } from '@/services/prisma-client.service'

class PrismaQueueMessageRepositoryService implements QueueMessageRepositoryInterface {
  private mapQueueMessageRecord(queueMessageRecord: {
    body: Prisma.JsonValue
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
  }): QueueMessageRecord {
    return {
      body: queueMessageRecord.body,
      createdAt: queueMessageRecord.createdAt,
      deadLetterQueueName: queueMessageRecord.deadLetterQueueName,
      id: queueMessageRecord.id,
      maxReceiveCount: queueMessageRecord.maxReceiveCount,
      messageDeduplicationId: queueMessageRecord.messageDeduplicationId,
      messageGroupId: queueMessageRecord.messageGroupId,
      queueName: queueMessageRecord.queueName,
      receiptHandleHash: queueMessageRecord.receiptHandleHash,
      receiveCount: queueMessageRecord.receiveCount,
      serviceUserUuid: queueMessageRecord.serviceUserUuid,
      sourceQueueName: queueMessageRecord.sourceQueueName,
      visibleAt: queueMessageRecord.visibleAt,
    }
  }

  private get prismaClient(): PrismaClient {
    return this.prismaClientService.getClient()
  }

  constructor(private readonly prismaClientService: PrismaClientService = new PrismaClientService()) {}

  async claimQueueMessageById(claimQueueMessageInput: ClaimQueueMessageInput): Promise<boolean> {
    const updateResult = await this.prismaClient.queueMessage.updateMany({
      data: {
        receiptHandleHash: claimQueueMessageInput.nextReceiptHandleHash,
        receiveCount: {
          increment: 1,
        },
        visibleAt: claimQueueMessageInput.nextVisibleAt,
      },
      where: {
        id: claimQueueMessageInput.messageId,
        queueName: claimQueueMessageInput.queueName,
        serviceUserUuid: claimQueueMessageInput.serviceUserUuid,
        visibleAt: {
          lte: claimQueueMessageInput.claimableAt,
        },
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
        serviceUserUuid: createQueueMessageInput.serviceUserUuid,
        visibleAt: createQueueMessageInput.visibleAt,
      },
    })

    return this.mapQueueMessageRecord(queueMessageRecord)
  }

  async deleteQueueMessageByReceiptHandle(
    deleteQueueMessageByReceiptHandleInput: DeleteQueueMessageByReceiptHandleInput
  ): Promise<boolean> {
    const deleteResult = await this.prismaClient.queueMessage.deleteMany({
      where: {
        id: deleteQueueMessageByReceiptHandleInput.messageId,
        queueName: deleteQueueMessageByReceiptHandleInput.queueName,
        receiptHandleHash: deleteQueueMessageByReceiptHandleInput.receiptHandleHash,
        serviceUserUuid: deleteQueueMessageByReceiptHandleInput.serviceUserUuid,
      },
    })

    return deleteResult.count === 1
  }

  async findRecentMessageByDeduplicationId(
    findRecentMessageByDeduplicationIdInput: FindRecentMessageByDeduplicationIdInput
  ): Promise<QueueMessageRecord | null> {
    const queueMessageRecord = await this.prismaClient.queueMessage.findFirst({
      orderBy: {
        createdAt: 'desc',
      },
      where: {
        createdAt: {
          gte: findRecentMessageByDeduplicationIdInput.createdAtOrAfter,
        },
        messageDeduplicationId: findRecentMessageByDeduplicationIdInput.messageDeduplicationId,
        queueName: findRecentMessageByDeduplicationIdInput.queueName,
        serviceUserUuid: findRecentMessageByDeduplicationIdInput.serviceUserUuid,
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
        createdAt: {
          lt: hasInflightMessageInFifoGroupInput.createdAtBefore,
        },
        messageGroupId: hasInflightMessageInFifoGroupInput.messageGroupId,
        queueName: hasInflightMessageInFifoGroupInput.queueName,
        serviceUserUuid: hasInflightMessageInFifoGroupInput.serviceUserUuid,
        visibleAt: {
          gt: hasInflightMessageInFifoGroupInput.visibleAtAfter,
        },
      },
    })

    return inflightMessageCount > 0
  }

  async listVisibleQueueMessages(listVisibleQueueMessagesInput: ListVisibleQueueMessagesInput): Promise<QueueMessageRecord[]> {
    const queueMessageRecords = await this.prismaClient.queueMessage.findMany({
      orderBy: {
        createdAt: 'asc',
      },
      take: listVisibleQueueMessagesInput.limit,
      where: {
        queueName: listVisibleQueueMessagesInput.queueName,
        serviceUserUuid: listVisibleQueueMessagesInput.serviceUserUuid,
        visibleAt: {
          lte: listVisibleQueueMessagesInput.visibleAtOrBefore,
        },
      },
    })

    return queueMessageRecords.map((queueMessageRecord) => {
      return this.mapQueueMessageRecord(queueMessageRecord)
    })
  }

  async moveQueueMessageToDeadLetterQueue(
    moveQueueMessageToDeadLetterQueueInput: MoveQueueMessageToDeadLetterQueueInput
  ): Promise<boolean> {
    const updateResult = await this.prismaClient.queueMessage.updateMany({
      data: {
        deadLetterQueueName: null,
        maxReceiveCount: null,
        queueName: moveQueueMessageToDeadLetterQueueInput.deadLetterQueueName,
        receiptHandleHash: null,
        receiveCount: 0,
        sourceQueueName: moveQueueMessageToDeadLetterQueueInput.queueName,
        visibleAt: new Date(),
      },
      where: {
        id: moveQueueMessageToDeadLetterQueueInput.messageId,
        queueName: moveQueueMessageToDeadLetterQueueInput.queueName,
        serviceUserUuid: moveQueueMessageToDeadLetterQueueInput.serviceUserUuid,
      },
    })

    return updateResult.count === 1
  }

  async setQueueMessageVisibilityByReceiptHandle(
    setQueueMessageVisibilityByReceiptHandleInput: SetQueueMessageVisibilityByReceiptHandleInput
  ): Promise<QueueMessageRecord | null> {
    const updateResult = await this.prismaClient.queueMessage.updateMany({
      data: {
        visibleAt: setQueueMessageVisibilityByReceiptHandleInput.visibleAt,
      },
      where: {
        id: setQueueMessageVisibilityByReceiptHandleInput.messageId,
        queueName: setQueueMessageVisibilityByReceiptHandleInput.queueName,
        receiptHandleHash: setQueueMessageVisibilityByReceiptHandleInput.receiptHandleHash,
        serviceUserUuid: setQueueMessageVisibilityByReceiptHandleInput.serviceUserUuid,
      },
    })

    if (updateResult.count !== 1) {
      return null
    }

    const queueMessageRecord = await this.prismaClient.queueMessage.findUnique({
      where: {
        id: setQueueMessageVisibilityByReceiptHandleInput.messageId,
      },
    })

    if (queueMessageRecord === null) {
      return null
    }

    return this.mapQueueMessageRecord(queueMessageRecord)
  }
}

export { PrismaQueueMessageRepositoryService }
