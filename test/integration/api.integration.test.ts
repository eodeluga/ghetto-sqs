import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readEnvironment } from '@/config/environment'
import { type RouteDependencies } from '@/routes'
import { buildServer } from '@/server'
import { type DatabaseHealthCheckerInterface } from '@/interfaces/database-health-checker.interface'
import { HandleRegistrationService } from '@/services/handle-registration.service'
import { HandleSecurityService } from '@/services/handle-security.service'
import { MessageSignatureService } from '@/services/message-signature.service'
import { QueueMessageService } from '@/services/queue-message.service'
import { RequestRateLimiterService } from '@/services/request-rate-limiter.service'
import { SignedRequestAuthService } from '@/services/signed-request-auth.service'
import { SigningKeyCryptoService } from '@/services/signing-key-crypto.service'
import { SystemHealthService } from '@/services/system-health.service'
import {
  InMemoryQueueMessageRepository,
  InMemoryRequestSecurityRepository,
  InMemoryServiceHandleRepository,
} from '../support/in-memory-repositories'
import { createSignedHeaders } from '../support/signature.util'

type RegisteredCredentials = {
  defaultMaxReceiveCount: number
  defaultVisibilityTimeoutSeconds: number
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
  const requestRateLimiterService = new RequestRateLimiterService({
    ...environment,
    REQUEST_RATE_LIMIT_BAN_AFTER_VIOLATIONS: 2,
    REQUEST_RATE_LIMIT_BAN_SECONDS: 2,
    REQUEST_RATE_LIMIT_MAX_PER_WINDOW: 20,
    REQUEST_RATE_LIMIT_WINDOW_SECONDS: 1,
  })
  const requestSecurityRepository = new InMemoryRequestSecurityRepository()
  const serviceHandleRepository = new InMemoryServiceHandleRepository()
  const signingKeyCryptoService = new SigningKeyCryptoService(environment)
  const handleRegistrationService = new HandleRegistrationService(
    requestSecurityRepository,
    serviceHandleRepository,
    signingKeyCryptoService
  )
  const handleSecurityService = new HandleSecurityService(
    requestSecurityRepository,
    serviceHandleRepository,
    signingKeyCryptoService
  )
  const queueMessageService = new QueueMessageService(messageSignatureService, queueMessageRepository, environment)
  const signedRequestAuthService = new SignedRequestAuthService(
    environment,
    messageSignatureService,
    requestRateLimiterService,
    requestSecurityRepository,
    serviceHandleRepository,
    signingKeyCryptoService
  )
  const databaseHealthChecker: DatabaseHealthCheckerInterface = {
    ping: () => {
      return Promise.resolve()
    },
  }
  const routeDependencies: RouteDependencies = {
    handleRegistrationService,
    handleSecurityService,
    queueMessageService,
    signedRequestAuthService,
    systemHealthService: new SystemHealthService(databaseHealthChecker),
  }
  const fastify = buildServer(environment, routeDependencies)

  await fastify.ready()

  return {
    fastify,
    messageSignatureService,
  }
}

const registerHandle = async (
  testContext: TestContext,
  registerHandleInput: {
    defaultMaxReceiveCount?: number
    defaultVisibilityTimeoutSeconds?: number
    label: string
  },
): Promise<RegisteredCredentials> => {
  const registerResponse = await testContext.fastify.inject({
    method: 'POST',
    path: '/v1/handles/register',
    payload: registerHandleInput,
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

  it('returns ready status when dependencies are healthy', async () => {
    const response = await testContext.fastify.inject({
      method: 'GET',
      path: '/health/ready',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      status: 'ready',
    })
  })

  it('registers a service handle and returns credentials', async () => {
    const response = await testContext.fastify.inject({
      method: 'POST',
      path: '/v1/handles/register',
      payload: {
        defaultMaxReceiveCount: 7,
        defaultVisibilityTimeoutSeconds: 15,
        label: 'worker-one',
      },
    })

    expect(response.statusCode).toBe(201)
    const responseBody = response.json()

    expect(responseBody.userUuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    expect(responseBody.defaultMaxReceiveCount).toBe(7)
    expect(responseBody.defaultVisibilityTimeoutSeconds).toBe(15)
    expect(responseBody.signingKey).toMatch(/^[0-9a-f]+$/i)
  })

  it('applies sane defaults when registration defaults are not supplied', async () => {
    const credentials = await registerHandle(testContext, {
      label: 'worker-defaults',
    })

    expect(credentials.defaultMaxReceiveCount).toBe(5)
    expect(credentials.defaultVisibilityTimeoutSeconds).toBe(30)
  })

  it('rejects duplicate handle registrations without changing the existing handle behaviour', async () => {
    const credentials = await registerHandle(testContext, {
      defaultMaxReceiveCount: 1,
      defaultVisibilityTimeoutSeconds: 0,
      label: 'worker-duplicate',
    })
    const duplicateRegistrationResponse = await testContext.fastify.inject({
      method: 'POST',
      path: '/v1/handles/register',
      payload: {
        defaultMaxReceiveCount: 9,
        defaultVisibilityTimeoutSeconds: 30,
        label: 'worker-duplicate',
      },
    })

    expect(duplicateRegistrationResponse.statusCode).toBe(409)
    expect(duplicateRegistrationResponse.json().code).toBe('already_registered')
    const enqueuePath = '/v1/queues/duplicate/messages'
    const enqueueResponse = await signedInject(testContext, credentials, {
      method: 'POST',
      path: enqueuePath,
      payload: {
        body: {
          jobId: 'job-duplicate-1',
        },
        deadLetterQueueName: 'duplicate-dlq',
        delaySeconds: 0,
      },
    })

    expect(enqueueResponse.statusCode).toBe(201)
    const sourceReceivePath = '/v1/queues/duplicate/messages/receive?maxMessages=1'
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
    const dlqReceivePath = '/v1/queues/duplicate-dlq/messages/receive?maxMessages=1'
    const dlqReceiveResponse = await signedInject(testContext, credentials, {
      method: 'GET',
      path: dlqReceivePath,
    })

    expect(dlqReceiveResponse.statusCode).toBe(200)
    expect(dlqReceiveResponse.json().messages).toHaveLength(1)
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
    const credentials = await registerHandle(testContext, {
      label: 'worker-two',
    })
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
    const firstCredentials = await registerHandle(testContext, {
      label: 'worker-three',
    })
    const secondCredentials = await registerHandle(testContext, {
      label: 'worker-four',
    })
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
    const credentials = await registerHandle(testContext, {
      label: 'worker-five',
    })
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

  it('rejects nonce replay within the accepted signature window', async () => {
    const credentials = await registerHandle(testContext, {
      label: 'worker-replay',
    })
    const enqueuePath = '/v1/queues/replay/messages'
    const enqueuePayload = {
      body: {
        jobId: 'job-replay-1',
      },
      delaySeconds: 0,
    }
    const replayHeaders = createSignedHeaders({
      body: enqueuePayload,
      method: 'POST',
      nonce: 'nonce-replay-test-0001',
      requestPath: enqueuePath,
      signingKey: credentials.signingKey,
      userUuid: credentials.userUuid,
    }, testContext.messageSignatureService)
    const firstResponse = await testContext.fastify.inject({
      headers: replayHeaders,
      method: 'POST',
      path: enqueuePath,
      payload: enqueuePayload,
    })

    expect(firstResponse.statusCode).toBe(201)
    const replayResponse = await testContext.fastify.inject({
      headers: replayHeaders,
      method: 'POST',
      path: enqueuePath,
      payload: enqueuePayload,
    })

    expect(replayResponse.statusCode).toBe(401)
    expect(replayResponse.json().code).toBe('unauthorised')
  })

  it('rate limits repeated signed requests by handle and ip', async () => {
    const credentials = await registerHandle(testContext, {
      label: 'worker-rate-limit',
    })
    const receivePath = '/v1/queues/rate-limit/messages/receive?maxMessages=1'
    let sawRateLimitResponse = false

    for (let requestIndex = 0; requestIndex < 35; requestIndex += 1) {
      const response = await signedInject(testContext, credentials, {
        method: 'GET',
        path: receivePath,
      })

      if (response.statusCode === 429) {
        sawRateLimitResponse = true
        break
      }
    }

    expect(sawRateLimitResponse).toBe(true)
  })

  it('rotates signing keys and invalidates the previous key', async () => {
    const credentials = await registerHandle(testContext, {
      label: 'worker-rotate',
    })
    const rotatePath = '/v1/handles/keys/rotate'
    const rotateResponse = await signedInject(testContext, credentials, {
      method: 'POST',
      path: rotatePath,
    })

    expect(rotateResponse.statusCode).toBe(200)
    expect(rotateResponse.json().keyVersion).toBe(2)
    const enqueuePath = '/v1/queues/rotation/messages'
    const enqueuePayload = {
      body: {
        jobId: 'job-rotation-1',
      },
      delaySeconds: 0,
    }
    const staleKeyResponse = await signedInject(testContext, credentials, {
      method: 'POST',
      path: enqueuePath,
      payload: enqueuePayload,
    })

    expect(staleKeyResponse.statusCode).toBe(401)
    const rotatedCredentials: RegisteredCredentials = {
      ...credentials,
      signingKey: rotateResponse.json().signingKey,
    }
    const rotatedKeyResponse = await signedInject(testContext, rotatedCredentials, {
      method: 'POST',
      path: enqueuePath,
      payload: enqueuePayload,
    })

    expect(rotatedKeyResponse.statusCode).toBe(201)
  })

  it('revokes handles and blocks further signed requests', async () => {
    const credentials = await registerHandle(testContext, {
      label: 'worker-revoke',
    })
    const revokePath = '/v1/handles/revoke'
    const revokeResponse = await signedInject(testContext, credentials, {
      method: 'POST',
      path: revokePath,
    })

    expect(revokeResponse.statusCode).toBe(200)
    expect(revokeResponse.json().revoked).toBe(true)
    const enqueuePath = '/v1/queues/revoked/messages'
    const enqueueResponse = await signedInject(testContext, credentials, {
      method: 'POST',
      path: enqueuePath,
      payload: {
        body: {
          jobId: 'job-revoked-1',
        },
        delaySeconds: 0,
      },
    })

    expect(enqueueResponse.statusCode).toBe(401)
    expect(enqueueResponse.json().code).toBe('unauthorised')
  })

  it('requires messageGroupId for FIFO queue messages', async () => {
    const credentials = await registerHandle(testContext, {
      label: 'worker-six',
    })
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
    const credentials = await registerHandle(testContext, {
      label: 'worker-seven',
    })
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

  it('does not deliver multiple FIFO messages from the same group concurrently', async () => {
    const credentials = await registerHandle(testContext, {
      label: 'worker-fifo-concurrency',
    })
    const enqueuePath = '/v1/queues/orders.fifo/messages'
    const firstEnqueueResponse = await signedInject(testContext, credentials, {
      method: 'POST',
      path: enqueuePath,
      payload: {
        body: {
          orderId: 'order-concurrency-1',
        },
        delaySeconds: 0,
        messageGroupId: 'group-concurrency',
      },
    })
    const secondEnqueueResponse = await signedInject(testContext, credentials, {
      method: 'POST',
      path: enqueuePath,
      payload: {
        body: {
          orderId: 'order-concurrency-2',
        },
        delaySeconds: 0,
        messageGroupId: 'group-concurrency',
      },
    })

    expect(firstEnqueueResponse.statusCode).toBe(201)
    expect(secondEnqueueResponse.statusCode).toBe(201)
    const receivePath = '/v1/queues/orders.fifo/messages/receive?maxMessages=1&visibilityTimeoutSeconds=30'
    const [firstReceiveResponse, secondReceiveResponse] = await Promise.all([
      signedInject(testContext, credentials, {
        method: 'GET',
        path: receivePath,
      }),
      signedInject(testContext, credentials, {
        method: 'GET',
        path: receivePath,
      }),
    ])

    expect(firstReceiveResponse.statusCode).toBe(200)
    expect(secondReceiveResponse.statusCode).toBe(200)
    const firstResponseMessageCount = firstReceiveResponse.json().messages.length
    const secondResponseMessageCount = secondReceiveResponse.json().messages.length

    expect(firstResponseMessageCount + secondResponseMessageCount).toBe(1)
  })

  it('deduplicates FIFO messages using messageDeduplicationId', async () => {
    const credentials = await registerHandle(testContext, {
      label: 'worker-eight',
    })
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
    const credentials = await registerHandle(testContext, {
      label: 'worker-nine',
    })
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

  it('uses handle defaults for visibility timeout and maxReceiveCount when omitted', async () => {
    const credentials = await registerHandle(testContext, {
      defaultMaxReceiveCount: 1,
      defaultVisibilityTimeoutSeconds: 0,
      label: 'worker-default-policy',
    })
    const enqueuePath = '/v1/queues/default-policy/messages'
    const enqueueResponse = await signedInject(testContext, credentials, {
      method: 'POST',
      path: enqueuePath,
      payload: {
        body: {
          jobId: 'job-default-policy',
        },
        deadLetterQueueName: 'default-policy-dlq',
        delaySeconds: 0,
      },
    })

    expect(enqueueResponse.statusCode).toBe(201)
    const sourceReceivePath = '/v1/queues/default-policy/messages/receive?maxMessages=1'
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
    const dlqReceivePath = '/v1/queues/default-policy-dlq/messages/receive?maxMessages=1'
    const dlqReceiveResponse = await signedInject(testContext, credentials, {
      method: 'GET',
      path: dlqReceivePath,
    })

    expect(dlqReceiveResponse.statusCode).toBe(200)
    expect(dlqReceiveResponse.json().messages).toHaveLength(1)
    expect(dlqReceiveResponse.json().messages[0].body).toEqual({
      jobId: 'job-default-policy',
    })
  })
})
