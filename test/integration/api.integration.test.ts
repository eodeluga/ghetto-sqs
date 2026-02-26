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
    const registerResponse = await testContext.fastify.inject({
      method: 'POST',
      path: '/v1/handles/register',
      payload: {
        label: 'worker-two',
      },
    })
    const credentials = registerResponse.json()
    const enqueuePath = '/v1/queues/jobs/messages'
    const enqueuePayload = {
      body: {
        jobId: 'job-2',
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
    const enqueueResponse = await testContext.fastify.inject({
      headers: enqueueHeaders,
      method: 'POST',
      path: enqueuePath,
      payload: enqueuePayload,
    })

    expect(enqueueResponse.statusCode).toBe(201)
    const enqueueBody = enqueueResponse.json()
    const receivePath = '/v1/queues/jobs/messages/receive?maxMessages=1&visibilityTimeoutSeconds=30'
    const receiveHeaders = createSignedHeaders({
      method: 'GET',
      requestPath: receivePath,
      signingKey: credentials.signingKey,
      userUuid: credentials.userUuid,
    }, testContext.messageSignatureService)
    const receiveResponse = await testContext.fastify.inject({
      headers: receiveHeaders,
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
    const visibilityHeaders = createSignedHeaders({
      body: visibilityPayload,
      method: 'POST',
      requestPath: visibilityPath,
      signingKey: credentials.signingKey,
      userUuid: credentials.userUuid,
    }, testContext.messageSignatureService)
    const visibilityResponse = await testContext.fastify.inject({
      headers: visibilityHeaders,
      method: 'POST',
      path: visibilityPath,
      payload: visibilityPayload,
    })

    expect(visibilityResponse.statusCode).toBe(200)
    const deletePath = `/v1/queues/jobs/messages/${enqueueBody.messageId}`
    const deletePayload = {
      receiptHandle: receiveBody.messages[0].receiptHandle,
    }
    const deleteHeaders = createSignedHeaders({
      body: deletePayload,
      method: 'DELETE',
      requestPath: deletePath,
      signingKey: credentials.signingKey,
      userUuid: credentials.userUuid,
    }, testContext.messageSignatureService)
    const deleteResponse = await testContext.fastify.inject({
      headers: deleteHeaders,
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
    const firstRegisterResponse = await testContext.fastify.inject({
      method: 'POST',
      path: '/v1/handles/register',
      payload: {
        label: 'worker-three',
      },
    })
    const secondRegisterResponse = await testContext.fastify.inject({
      method: 'POST',
      path: '/v1/handles/register',
      payload: {
        label: 'worker-four',
      },
    })
    const firstCredentials = firstRegisterResponse.json()
    const secondCredentials = secondRegisterResponse.json()
    const enqueuePath = '/v1/queues/jobs/messages'
    const enqueuePayload = {
      body: {
        jobId: 'job-3',
      },
      delaySeconds: 0,
    }
    const enqueueHeaders = createSignedHeaders({
      body: enqueuePayload,
      method: 'POST',
      requestPath: enqueuePath,
      signingKey: firstCredentials.signingKey,
      userUuid: firstCredentials.userUuid,
    }, testContext.messageSignatureService)

    await testContext.fastify.inject({
      headers: enqueueHeaders,
      method: 'POST',
      path: enqueuePath,
      payload: enqueuePayload,
    })

    const receivePath = '/v1/queues/jobs/messages/receive?maxMessages=1&visibilityTimeoutSeconds=30'
    const secondReceiveHeaders = createSignedHeaders({
      method: 'GET',
      requestPath: receivePath,
      signingKey: secondCredentials.signingKey,
      userUuid: secondCredentials.userUuid,
    }, testContext.messageSignatureService)
    const secondReceiveResponse = await testContext.fastify.inject({
      headers: secondReceiveHeaders,
      method: 'GET',
      path: receivePath,
    })

    expect(secondReceiveResponse.statusCode).toBe(200)
    expect(secondReceiveResponse.json()).toEqual({
      messages: [],
    })
  })

  it('rejects tampered signatures', async () => {
    const registerResponse = await testContext.fastify.inject({
      method: 'POST',
      path: '/v1/handles/register',
      payload: {
        label: 'worker-five',
      },
    })
    const credentials = registerResponse.json()
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
})
