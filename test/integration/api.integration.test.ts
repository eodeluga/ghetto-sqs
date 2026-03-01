import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readEnvironment } from '@/config/environment'
import { type RouteDependencies } from '@/routes'
import { buildServer } from '@/server'
import { MessageSignatureService } from '@/services/message-signature.service'
import { QueueMessageService } from '@/services/queue-message.service'
import { SystemHealthService } from '@/services/system-health.service'
import { InMemoryQueueMessageRepository } from '../support/in-memory-repositories'

type ReceivedMessage = {
  approximateReceiveCount: number
  body: unknown
  messageId: string
  queueName: string
  receiptHandle: string
  visibilityExpiresAt: string
}

type ReceiveMessagesResponse = {
  messages: ReceivedMessage[]
}

type TestContext = {
  fastify: ReturnType<typeof buildServer>
}

const createTestContext = async (): Promise<TestContext> => {
  const environment = readEnvironment()
  const queueMessageRepository = new InMemoryQueueMessageRepository()
  const queueMessageService = new QueueMessageService(new MessageSignatureService(), queueMessageRepository, environment)
  const systemHealthService = new SystemHealthService({
    ping: () => {
      return Promise.resolve()
    },
  })
  const routeDependencies: RouteDependencies = {
    queueMessageService,
    systemHealthService,
  }
  const fastify = buildServer(environment, routeDependencies)

  await fastify.ready()

  return {
    fastify,
  }
}

const deleteMessage = async (
  testContext: TestContext,
  queueName: string,
  receiptHandle: string
): Promise<Awaited<ReturnType<typeof testContext.fastify.inject>>> => {
  return testContext.fastify.inject({
    method: 'DELETE',
    path: `/v1/queues/${queueName}/messages`,
    payload: {
      receiptHandle,
    },
  })
}

const enqueueMessage = async (
  testContext: TestContext,
  queueName: string,
  payload: {
    body: unknown
    delaySeconds?: number
  }
): Promise<string> => {
  const enqueueResponse = await testContext.fastify.inject({
    method: 'POST',
    path: `/v1/queues/${queueName}/messages`,
    payload,
  })

  expect(enqueueResponse.statusCode).toBe(201)

  return enqueueResponse.json().messageId as string
}

const receiveMessages = async (
  testContext: TestContext,
  queueName: string,
  visibilityTimeoutSeconds: number
): Promise<ReceiveMessagesResponse> => {
  const receiveResponse = await testContext.fastify.inject({
    method: 'GET',
    path: `/v1/queues/${queueName}/messages/receive?maxMessages=1&visibilityTimeoutSeconds=${visibilityTimeoutSeconds}`,
  })

  expect(receiveResponse.statusCode).toBe(200)

  return receiveResponse.json() as ReceiveMessagesResponse
}

const sleep = async (sleepDurationMs: number): Promise<void> => {
  await new Promise((resolveSleep) => {
    setTimeout(resolveSleep, sleepDurationMs)
  })
}

describe('SQS compatibility integration', () => {
  let testContext: TestContext

  beforeEach(async () => {
    testContext = await createTestContext()
  })

  afterEach(async () => {
    await testContext.fastify.close()
  })

  it('returns health and readiness', async () => {
    const healthResponse = await testContext.fastify.inject({
      method: 'GET',
      path: '/health',
    })
    const readinessResponse = await testContext.fastify.inject({
      method: 'GET',
      path: '/health/ready',
    })

    expect(healthResponse.statusCode).toBe(200)
    expect(healthResponse.json()).toEqual({
      status: 'ok',
    })
    expect(readinessResponse.statusCode).toBe(200)
    expect(readinessResponse.json()).toEqual({
      status: 'ready',
    })
  })

  it('receive then delete within timeout removes the message', async () => {
    const messageId = await enqueueMessage(testContext, 'jobs', {
      body: {
        jobId: 'job-delete-within-timeout',
      },
      delaySeconds: 0,
    })
    const firstReceiveResponseBody = await receiveMessages(testContext, 'jobs', 30)

    expect(firstReceiveResponseBody.messages).toHaveLength(1)
    const firstReceivedMessage = firstReceiveResponseBody.messages[0]

    expect(firstReceivedMessage.messageId).toBe(messageId)
    expect(firstReceivedMessage.receiptHandle.length).toBeGreaterThan(0)
    expect(firstReceivedMessage.approximateReceiveCount).toBe(1)
    const deleteResponse = await deleteMessage(testContext, 'jobs', firstReceivedMessage.receiptHandle)

    expect(deleteResponse.statusCode).toBe(200)
    expect(deleteResponse.json()).toEqual({
      deleted: true,
    })

    const secondReceiveResponseBody = await receiveMessages(testContext, 'jobs', 30)

    expect(secondReceiveResponseBody).toEqual({
      messages: [],
    })
  })

  it('receive without delete and timeout expiry returns same message with a new receipt handle', async () => {
    await enqueueMessage(testContext, 'timeouts', {
      body: {
        jobId: 'job-timeout-redelivery',
      },
      delaySeconds: 0,
    })

    const firstReceiveResponseBody = await receiveMessages(testContext, 'timeouts', 0)

    expect(firstReceiveResponseBody.messages).toHaveLength(1)

    const firstReceivedMessage = firstReceiveResponseBody.messages[0]

    await sleep(10)

    const secondReceiveResponseBody = await receiveMessages(testContext, 'timeouts', 30)

    expect(secondReceiveResponseBody.messages).toHaveLength(1)

    const secondReceivedMessage = secondReceiveResponseBody.messages[0]

    expect(secondReceivedMessage.messageId).toBe(firstReceivedMessage.messageId)
    expect(secondReceivedMessage.receiptHandle).not.toBe(firstReceivedMessage.receiptHandle)
    expect(secondReceivedMessage.approximateReceiveCount).toBe(2)
  })

  it('stale receipt handles fail deletion after visibility expiry and redelivery', async () => {
    await enqueueMessage(testContext, 'stale-handle', {
      body: {
        jobId: 'job-stale-handle',
      },
      delaySeconds: 0,
    })

    const firstReceiveResponseBody = await receiveMessages(testContext, 'stale-handle', 0)

    expect(firstReceiveResponseBody.messages).toHaveLength(1)

    const firstReceivedMessage = firstReceiveResponseBody.messages[0]

    await sleep(10)
    await receiveMessages(testContext, 'stale-handle', 30)

    const staleDeleteResponse = await deleteMessage(testContext, 'stale-handle', firstReceivedMessage.receiptHandle)

    expect(staleDeleteResponse.statusCode).toBe(400)
    expect(staleDeleteResponse.json().code).toBe('receipt_handle_invalid')
  })

  it('does not deliver one visible message twice across concurrent receives', async () => {
    await enqueueMessage(testContext, 'concurrency', {
      body: {
        jobId: 'job-concurrency',
      },
      delaySeconds: 0,
    })

    const [firstReceiveResponse, secondReceiveResponse] = await Promise.all([
      testContext.fastify.inject({
        method: 'GET',
        path: '/v1/queues/concurrency/messages/receive?maxMessages=1&visibilityTimeoutSeconds=30',
      }),
      testContext.fastify.inject({
        method: 'GET',
        path: '/v1/queues/concurrency/messages/receive?maxMessages=1&visibilityTimeoutSeconds=30',
      }),
    ])

    expect(firstReceiveResponse.statusCode).toBe(200)
    expect(secondReceiveResponse.statusCode).toBe(200)

    const firstBody = firstReceiveResponse.json() as ReceiveMessagesResponse
    const secondBody = secondReceiveResponse.json() as ReceiveMessagesResponse
    const deliveredMessageIds = [...firstBody.messages, ...secondBody.messages].map((receivedMessage) => {
      return receivedMessage.messageId
    })

    expect(deliveredMessageIds).toHaveLength(1)
  })

  it('delete with random receipt handle fails', async () => {
    await enqueueMessage(testContext, 'invalid-delete', {
      body: {
        jobId: 'job-invalid-delete',
      },
      delaySeconds: 0,
    })

    const deleteResponse = await deleteMessage(testContext, 'invalid-delete', 'receipt-handle-does-not-exist')

    expect(deleteResponse.statusCode).toBe(400)
    expect(deleteResponse.json().code).toBe('receipt_handle_invalid')
  })

  it('deleting twice with the same receipt handle succeeds once then fails', async () => {
    await enqueueMessage(testContext, 'idempotency', {
      body: {
        jobId: 'job-idempotency',
      },
      delaySeconds: 0,
    })

    const firstReceiveResponseBody = await receiveMessages(testContext, 'idempotency', 30)

    expect(firstReceiveResponseBody.messages).toHaveLength(1)

    const receiptHandle = firstReceiveResponseBody.messages[0].receiptHandle
    const firstDeleteResponse = await deleteMessage(testContext, 'idempotency', receiptHandle)
    const secondDeleteResponse = await deleteMessage(testContext, 'idempotency', receiptHandle)

    expect(firstDeleteResponse.statusCode).toBe(200)
    expect(firstDeleteResponse.json()).toEqual({
      deleted: true,
    })
    expect(secondDeleteResponse.statusCode).toBe(400)
    expect(secondDeleteResponse.json().code).toBe('receipt_handle_invalid')
  })
})
