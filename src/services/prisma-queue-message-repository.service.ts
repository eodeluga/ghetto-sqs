import { Prisma, type PrismaClient } from '@prisma/client'
import {
  type ClaimQueueMessageInput,
  type CreateQueueMessageInput,
  type DeleteQueueMessageByReceiptHandleInput,
  type ListVisibleQueueMessagesInput,
  type QueueMessageRecord,
  type QueueMessageRepositoryInterface,
  type SetQueueMessageVisibilityByReceiptHandleInput,
} from '@/interfaces/queue-message-repository.interface'
import { PrismaClientService } from '@/services/prisma-client.service'

class PrismaQueueMessageRepositoryService implements QueueMessageRepositoryInterface {
  private mapQueueMessageRecord(queueMessageRecord: {
    body: Prisma.JsonValue
    createdAt: Date
    id: string
    queueName: string
    receiptHandleHash: string | null
    receiveCount: number
    serviceUserUuid: string
    visibleAt: Date
  }): QueueMessageRecord {
    return {
      body: queueMessageRecord.body,
      createdAt: queueMessageRecord.createdAt,
      id: queueMessageRecord.id,
      queueName: queueMessageRecord.queueName,
      receiptHandleHash: queueMessageRecord.receiptHandleHash,
      receiveCount: queueMessageRecord.receiveCount,
      serviceUserUuid: queueMessageRecord.serviceUserUuid,
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
