import { type PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readEnvironment } from '@/config/environment'
import { createRouteDependencies, type ServerRouteDependencies } from '@/routes'
import { buildServer } from '@/server'
import { MessageSignatureService } from '@/services/message-signature.service'
import { createSignedHeaders } from '../support/signature.util'

type RegisteredCredentials = {
  defaultMaxReceiveCount: number
  defaultVisibilityTimeoutSeconds: number
  signingKey: string
  userUuid: string
}

type TestContext = {
  databaseAvailable: boolean
  fastify: ReturnType<typeof buildServer> | null
  messageSignatureService: MessageSignatureService
  routeDependencies: ServerRouteDependencies | null
}

const pingDatabaseWithTimeout = async (
  routeDependencies: ServerRouteDependencies,
  timeoutMilliseconds: number = 2000,
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      reject(new Error('Prisma ping timed out'))
    }, timeoutMilliseconds)

    routeDependencies.prismaClientService.ping().then(() => {
      clearTimeout(timeoutHandle)
      resolve()
    }).catch((error: unknown) => {
      clearTimeout(timeoutHandle)
      reject(error)
    })
  })
}

const disconnectDatabaseWithTimeout = async (
  routeDependencies: ServerRouteDependencies,
  timeoutMilliseconds: number = 2000,
): Promise<void> => {
  await new Promise((resolve) => {
    const timeoutHandle = setTimeout(() => {
      resolve(undefined)
    }, timeoutMilliseconds)

    routeDependencies.prismaClientService.disconnect().then(() => {
      clearTimeout(timeoutHandle)
      resolve(undefined)
    }).catch(() => {
      clearTimeout(timeoutHandle)
      resolve(undefined)
    })
  })
}

const clearDatabase = async (prismaClient: PrismaClient): Promise<void> => {
  await prismaClient.auditEvent.deleteMany()
  await prismaClient.queueMessage.deleteMany()
  await prismaClient.serviceSigningKey.deleteMany()
  await prismaClient.serviceHandle.deleteMany()
  await prismaClient.signedRequestNonce.deleteMany()
}

const signedInject = async (
  testContext: TestContext,
  credentials: RegisteredCredentials,
  options: {
    method: 'DELETE' | 'GET' | 'POST'
    path: string
    payload?: unknown
  },
): Promise<Awaited<ReturnType<NonNullable<TestContext['fastify']>['inject']>>> => {
  if (testContext.fastify === null) {
    throw new Error('Fastify server is unavailable for Prisma integration test')
  }

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

describe('API Prisma integration', () => {
  let testContext: TestContext = {
    databaseAvailable: false,
    fastify: null,
    messageSignatureService: new MessageSignatureService(),
    routeDependencies: null,
  }

  beforeAll(async () => {
    const environment = readEnvironment()
    const routeDependencies = createRouteDependencies(environment)

    try {
      await pingDatabaseWithTimeout(routeDependencies)
    } catch {
      testContext = {
        ...testContext,
        databaseAvailable: false,
        routeDependencies,
      }
      await disconnectDatabaseWithTimeout(routeDependencies)
      return
    }

    const fastify = buildServer(environment, routeDependencies)

    await fastify.ready()
    testContext = {
      databaseAvailable: true,
      fastify,
      messageSignatureService: new MessageSignatureService(),
      routeDependencies,
    }
  }, 30000)

  beforeEach(async () => {
    if (!testContext.databaseAvailable || testContext.routeDependencies === null) {
      return
    }

    const prismaClient = testContext.routeDependencies.prismaClientService.getClient()

    await clearDatabase(prismaClient)
  })

  afterAll(async () => {
    if (testContext.fastify !== null) {
      await testContext.fastify.close()
    }

    if (testContext.routeDependencies !== null) {
      await disconnectDatabaseWithTimeout(testContext.routeDependencies)
    }
  }, 30000)

  it('registers and immediately performs signed enqueue receive and delete with Prisma Mongo storage', async (context) => {
    if (!testContext.databaseAvailable || testContext.fastify === null) {
      context.skip()
      return
    }

    const registerResponse = await testContext.fastify.inject({
      method: 'POST',
      path: '/v1/handles/register',
      payload: {
        defaultMaxReceiveCount: 5,
        defaultVisibilityTimeoutSeconds: 30,
        label: `prisma-regression-${Date.now()}`,
      },
    })

    expect(registerResponse.statusCode).toBe(201)
    const credentials = registerResponse.json() as RegisteredCredentials
    const enqueuePath = '/v1/queues/prisma-regression/messages'
    const enqueuePayload = {
      body: {
        jobId: 'prisma-regression-1',
      },
      delaySeconds: 0,
    }
    const enqueueResponse = await signedInject(testContext, credentials, {
      method: 'POST',
      path: enqueuePath,
      payload: enqueuePayload,
    })

    expect(enqueueResponse.statusCode).toBe(201)
    const enqueueBody = enqueueResponse.json() as {
      deduplicated: boolean
      messageId: string
      queueName: string
      visibleAt: string
    }
    const receivePath = '/v1/queues/prisma-regression/messages/receive?maxMessages=1'
    const receiveResponse = await signedInject(testContext, credentials, {
      method: 'GET',
      path: receivePath,
    })

    expect(receiveResponse.statusCode).toBe(200)
    const receiveBody = receiveResponse.json() as {
      messages: {
        body: unknown
        messageId: string
        receiptHandle: string
      }[]
    }

    expect(receiveBody.messages).toHaveLength(1)
    const receivedMessage = receiveBody.messages[0]
    const deletePath = `/v1/queues/prisma-regression/messages/${receivedMessage.messageId}`
    const deleteResponse = await signedInject(testContext, credentials, {
      method: 'DELETE',
      path: deletePath,
      payload: {
        receiptHandle: receivedMessage.receiptHandle,
      },
    })

    expect(enqueueBody.messageId).toBe(receivedMessage.messageId)
    expect(deleteResponse.statusCode).toBe(200)
    expect(deleteResponse.json()).toEqual({
      deleted: true,
      messageId: receivedMessage.messageId,
    })
  })
})
