import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readEnvironment } from '@/config/environment'
import { type RouteDependencies } from '@/routes'
import { buildServer } from '@/server'
import { HandleRegistrationService } from '@/services/handle-registration.service'
import { MessageSignatureService } from '@/services/message-signature.service'
import { QueueMessageService } from '@/services/queue-message.service'
import { SignedRequestAuthService } from '@/services/signed-request-auth.service'
import { SystemHealthService } from '@/services/system-health.service'
import { InMemoryQueueMessageRepository, InMemoryServiceHandleRepository } from '../support/in-memory-repositories'
import { createSignedHeaders } from '../support/signature.util'

type RegisteredCredentials = {
  signingKey: string
  userUuid: string
}

type TestContext = {
  fastify: ReturnType<typeof buildServer>
  messageSignatureService: MessageSignatureService
}

const createTestContext = async (): Promise<TestContext> => {
  const environment = readEnvironment()
  const messageSignatureService = new MessageSignatureService()
  const queueMessageRepository = new InMemoryQueueMessageRepository()
  const serviceHandleRepository = new InMemoryServiceHandleRepository()
  const handleRegistrationService = new HandleRegistrationService(messageSignatureService, serviceHandleRepository)
  const queueMessageService = new QueueMessageService(messageSignatureService, queueMessageRepository)
  const signedRequestAuthService = new SignedRequestAuthService(environment, messageSignatureService, serviceHandleRepository)
  const routeDependencies: RouteDependencies = {
    handleRegistrationService,
    queueMessageService,
    signedRequestAuthService,
    systemHealthService: new SystemHealthService(),
  }
  const fastify = buildServer(environment, routeDependencies)

  await fastify.ready()

  return {
    fastify,
    messageSignatureService,
  }
}

const registerHandle = async (testContext: TestContext, label: string): Promise<RegisteredCredentials> => {
  const registerResponse = await testContext.fastify.inject({
    method: 'POST',
    path: '/v1/handles/register',
    payload: {
      label,
    },
  })

  expect(registerResponse.statusCode).toBe(201)

  return registerResponse.json()
}

const signedInject = async (
  testContext: TestContext,
  credentials: RegisteredCredentials,
  options: {
    method: 'DELETE' | 'GET' | 'POST'
    path: string
    payload?: unknown
  },
): Promise<Awaited<ReturnType<typeof testContext.fastify.inject>>> => {
  const headers = createSignedHeaders({
    body: options.payload,
    method: options.method,
    requestPath: options.path,
    signingKey: credentials.signingKey,
    userUuid: credentials.userUuid,
  }, testContext.messageSignatureService)

  return testContext.fastify.inject({
    headers,
    method: options.method,
    path: options.path,
    payload: options.payload,
  })
}

describe('API integration', () => {
  let testContext: TestContext

  beforeEach(async () => {
    testContext = await createTestContext()
  })

  afterEach(async () => {
    await testContext.fastify.close()
  })

  it('returns health status', async () => {
    const response = await testContext.fastify.inject({
      method: 'GET',
      path: '/health',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      status: 'ok',
    })
  })

  it('registers a service handle and returns credentials', async () => {
    const response = await testContext.fastify.inject({
      method: 'POST',
      path: '/v1/handles/register',
      payload: {
        label: 'worker-one',
      },
    })

    expect(response.statusCode).toBe(201)
    const responseBody = response.json()

    expect(responseBody.userUuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    expect(responseBody.signingKey).toMatch(/^[0-9a-f]+$/i)
  })

  it('rejects queue operations without signed headers', async () => {
    const response = await testContext.fastify.inject({
      method: 'POST',
      path: '/v1/queues/jobs/messages',
      payload: {
        body: {
          jobId: 'job-1',
        },
        delaySeconds: 0,
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().code).toBe('validation_error')
  })

  it('enqueues, receives, changes visibility, and deletes a message', async () => {
    const credentials = await registerHandle(testContext, 'worker-two')
    const enqueuePath = '/v1/queues/jobs/messages'
    const enqueuePayload = {
      body: {
        jobId: 'job-2',
      },
      delaySeconds: 0,
    }
    const enqueueResponse = await signedInject(testContext, credentials, {
      method: 'POST',
      path: enqueuePath,
      payload: enqueuePayload,
    })

    expect(enqueueResponse.statusCode).toBe(201)
    const enqueueBody = enqueueResponse.json()
    const receivePath = '/v1/queues/jobs/messages/receive?maxMessages=1&visibilityTimeoutSeconds=30'
    const receiveResponse = await signedInject(testContext, credentials, {
      method: 'GET',
      path: receivePath,
    })

    expect(receiveResponse.statusCode).toBe(200)
    const receiveBody = receiveResponse.json()

    expect(receiveBody.messages).toHaveLength(1)
    expect(receiveBody.messages[0].messageId).toBe(enqueueBody.messageId)
    const visibilityPath = `/v1/queues/jobs/messages/${enqueueBody.messageId}/visibility`
    const visibilityPayload = {
      receiptHandle: receiveBody.messages[0].receiptHandle,
      visibilityTimeoutSeconds: 1,
    }
    const visibilityResponse = await signedInject(testContext, credentials, {
      method: 'POST',
      path: visibilityPath,
      payload: visibilityPayload,
    })

    expect(visibilityResponse.statusCode).toBe(200)
    const deletePath = `/v1/queues/jobs/messages/${enqueueBody.messageId}`
    const deletePayload = {
      receiptHandle: receiveBody.messages[0].receiptHandle,
    }
    const deleteResponse = await signedInject(testContext, credentials, {
      method: 'DELETE',
      path: deletePath,
      payload: deletePayload,
    })

    expect(deleteResponse.statusCode).toBe(200)
    expect(deleteResponse.json()).toEqual({
      deleted: true,
      messageId: enqueueBody.messageId,
    })
  })

  it('enforces queue isolation between service handles', async () => {
    const firstCredentials = await registerHandle(testContext, 'worker-three')
    const secondCredentials = await registerHandle(testContext, 'worker-four')
    const enqueuePath = '/v1/queues/jobs/messages'
    const enqueuePayload = {
      body: {
        jobId: 'job-3',
      },
      delaySeconds: 0,
    }

    await signedInject(testContext, firstCredentials, {
      method: 'POST',
      path: enqueuePath,
      payload: enqueuePayload,
    })

    const receivePath = '/v1/queues/jobs/messages/receive?maxMessages=1&visibilityTimeoutSeconds=30'
    const secondReceiveResponse = await signedInject(testContext, secondCredentials, {
      method: 'GET',
      path: receivePath,
    })

    expect(secondReceiveResponse.statusCode).toBe(200)
    expect(secondReceiveResponse.json()).toEqual({
      messages: [],
    })
  })

  it('rejects tampered signatures', async () => {
    const credentials = await registerHandle(testContext, 'worker-five')
    const enqueuePath = '/v1/queues/jobs/messages'
    const enqueuePayload = {
      body: {
        jobId: 'job-4',
      },
      delaySeconds: 0,
    }
    const enqueueHeaders = createSignedHeaders({
      body: enqueuePayload,
      method: 'POST',
      requestPath: enqueuePath,
      signingKey: credentials.signingKey,
      userUuid: credentials.userUuid,
    }, testContext.messageSignatureService)

    enqueueHeaders['x-gsqs-signature'] = `${enqueueHeaders['x-gsqs-signature']}00`
    const response = await testContext.fastify.inject({
      headers: enqueueHeaders,
      method: 'POST',
      path: enqueuePath,
      payload: enqueuePayload,
    })

    expect(response.statusCode).toBe(401)
    expect(response.json().code).toBe('unauthorised')
  })

  it('requires messageGroupId for FIFO queue messages', async () => {
    const credentials = await registerHandle(testContext, 'worker-six')
    const enqueuePath = '/v1/queues/orders.fifo/messages'
    const enqueuePayload = {
      body: {
        jobId: 'job-fifo-1',
      },
      delaySeconds: 0,
    }
    const enqueueResponse = await signedInject(testContext, credentials, {
      method: 'POST',
      path: enqueuePath,
      payload: enqueuePayload,
    })

    expect(enqueueResponse.statusCode).toBe(400)
    expect(enqueueResponse.json().code).toBe('validation_error')
  })

  it('preserves FIFO ordering within a message group', async () => {
    const credentials = await registerHandle(testContext, 'worker-seven')
    const enqueuePath = '/v1/queues/orders.fifo/messages'
    const firstEnqueueResponse = await signedInject(testContext, credentials, {
      method: 'POST',
      path: enqueuePath,
      payload: {
        body: {
          orderId: 'order-1',
        },
        delaySeconds: 0,
        messageGroupId: 'group-a',
      },
    })
    const secondEnqueueResponse = await signedInject(testContext, credentials, {
      method: 'POST',
      path: enqueuePath,
      payload: {
        body: {
          orderId: 'order-2',
        },
        delaySeconds: 0,
        messageGroupId: 'group-a',
      },
    })

    expect(firstEnqueueResponse.statusCode).toBe(201)
    expect(secondEnqueueResponse.statusCode).toBe(201)
    const firstMessageId = firstEnqueueResponse.json().messageId
    const secondMessageId = secondEnqueueResponse.json().messageId
    const receivePath = '/v1/queues/orders.fifo/messages/receive?maxMessages=1&visibilityTimeoutSeconds=30'
    const firstReceiveResponse = await signedInject(testContext, credentials, {
      method: 'GET',
      path: receivePath,
    })

    expect(firstReceiveResponse.statusCode).toBe(200)
    expect(firstReceiveResponse.json().messages[0].messageId).toBe(firstMessageId)
    const secondReceiveResponse = await signedInject(testContext, credentials, {
      method: 'GET',
      path: receivePath,
    })

    expect(secondReceiveResponse.statusCode).toBe(200)
    expect(secondReceiveResponse.json()).toEqual({
      messages: [],
    })
    const deletePath = `/v1/queues/orders.fifo/messages/${firstMessageId}`
    const deleteResponse = await signedInject(testContext, credentials, {
      method: 'DELETE',
      path: deletePath,
      payload: {
        receiptHandle: firstReceiveResponse.json().messages[0].receiptHandle,
      },
    })

    expect(deleteResponse.statusCode).toBe(200)
    const thirdReceiveResponse = await signedInject(testContext, credentials, {
      method: 'GET',
      path: receivePath,
    })

    expect(thirdReceiveResponse.statusCode).toBe(200)
    expect(thirdReceiveResponse.json().messages[0].messageId).toBe(secondMessageId)
  })

  it('deduplicates FIFO messages using messageDeduplicationId', async () => {
    const credentials = await registerHandle(testContext, 'worker-eight')
    const enqueuePath = '/v1/queues/orders.fifo/messages'
    const firstEnqueueResponse = await signedInject(testContext, credentials, {
      method: 'POST',
      path: enqueuePath,
      payload: {
        body: {
          orderId: 'order-3',
        },
        delaySeconds: 0,
        messageDeduplicationId: 'dedup-order-3',
        messageGroupId: 'group-b',
      },
    })
    const secondEnqueueResponse = await signedInject(testContext, credentials, {
      method: 'POST',
      path: enqueuePath,
      payload: {
        body: {
          orderId: 'order-3-modified',
        },
        delaySeconds: 0,
        messageDeduplicationId: 'dedup-order-3',
        messageGroupId: 'group-b',
      },
    })

    expect(firstEnqueueResponse.statusCode).toBe(201)
    expect(firstEnqueueResponse.json().deduplicated).toBe(false)
    expect(secondEnqueueResponse.statusCode).toBe(201)
    expect(secondEnqueueResponse.json().deduplicated).toBe(true)
    expect(secondEnqueueResponse.json().messageId).toBe(firstEnqueueResponse.json().messageId)
  })

  it('moves messages to DLQ after maxReceiveCount is reached', async () => {
    const credentials = await registerHandle(testContext, 'worker-nine')
    const enqueuePath = '/v1/queues/jobs/messages'
    const enqueueResponse = await signedInject(testContext, credentials, {
      method: 'POST',
      path: enqueuePath,
      payload: {
        body: {
          jobId: 'job-dlq-1',
        },
        deadLetterQueueName: 'jobs-dlq',
        delaySeconds: 0,
        maxReceiveCount: 1,
      },
    })

    expect(enqueueResponse.statusCode).toBe(201)
    const sourceReceivePath = '/v1/queues/jobs/messages/receive?maxMessages=1&visibilityTimeoutSeconds=0'
    const firstSourceReceiveResponse = await signedInject(testContext, credentials, {
      method: 'GET',
      path: sourceReceivePath,
    })

    expect(firstSourceReceiveResponse.statusCode).toBe(200)
    expect(firstSourceReceiveResponse.json().messages).toHaveLength(1)
    const secondSourceReceiveResponse = await signedInject(testContext, credentials, {
      method: 'GET',
      path: sourceReceivePath,
    })

    expect(secondSourceReceiveResponse.statusCode).toBe(200)
    expect(secondSourceReceiveResponse.json()).toEqual({
      messages: [],
    })
    const dlqReceivePath = '/v1/queues/jobs-dlq/messages/receive?maxMessages=1&visibilityTimeoutSeconds=30'
    const dlqReceiveResponse = await signedInject(testContext, credentials, {
      method: 'GET',
      path: dlqReceivePath,
    })

    expect(dlqReceiveResponse.statusCode).toBe(200)
    expect(dlqReceiveResponse.json().messages).toHaveLength(1)
    expect(dlqReceiveResponse.json().messages[0].body).toEqual({
      jobId: 'job-dlq-1',
    })
  })
})
