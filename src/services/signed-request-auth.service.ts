import { type Environment } from '@/config/environment'
import { UnauthorisedError } from '@/errors'
import { type RequestSecurityRepositoryInterface } from '@/interfaces/request-security-repository.interface'
import { type AuthenticatedServiceContext } from '@/interfaces/authenticated-service-context.interface'
import { type ServiceHandleRepositoryInterface } from '@/interfaces/service-handle-repository.interface'
import { MessageSignatureService } from '@/services/message-signature.service'
import { PrismaRequestSecurityRepositoryService } from '@/services/prisma-request-security-repository.service'
import { PrismaServiceHandleRepositoryService } from '@/services/prisma-service-handle-repository.service'
import { RequestRateLimiterService } from '@/services/request-rate-limiter.service'
import { SigningKeyCryptoService } from '@/services/signing-key-crypto.service'
import { buildCanonicalRequest } from '@/utils/canonical-request.util'

type VerifySignedRequestInput = {
  body?: unknown
  clientIp: string
  method: string
  nonce: string
  requestPath: string
  signature: string
  timestamp: string
  userUuid: string
}

class SignedRequestAuthService {
  private readonly allowlistedServiceUuids: Set<string>

  private ensureServiceHandleIsAllowed(userUuid: string): void {
    if (this.allowlistedServiceUuids.size === 0) {
      return
    }

    if (!this.allowlistedServiceUuids.has(userUuid)) {
      throw new UnauthorisedError('Service handle is not allowlisted')
    }
  }

  private ensureTimestampIsValid(timestamp: string): void {
    const timestampAsNumber = Number(timestamp)

    if (!Number.isInteger(timestampAsNumber)) {
      throw new UnauthorisedError('Invalid request timestamp')
    }

    const nowAsUnixMilliseconds = Date.now()
    const toleranceInMilliseconds = this.environment.SIGNATURE_TOLERANCE_SECONDS * 1000
    const timestampDrift = Math.abs(nowAsUnixMilliseconds - timestampAsNumber)

    if (timestampDrift > toleranceInMilliseconds) {
      throw new UnauthorisedError('Request timestamp outside allowed tolerance')
    }
  }

  private ensureVerifiedNonce(verifySignedRequestInput: VerifySignedRequestInput): Promise<void> {
    const timestampAsNumber = Number(verifySignedRequestInput.timestamp)
    const nonceExpiresAt = new Date(timestampAsNumber + (this.environment.SIGNATURE_NONCE_TTL_SECONDS * 1000))

    return this.requestSecurityRepository.storeSignedRequestNonce({
      expiresAt: nonceExpiresAt,
      nonce: verifySignedRequestInput.nonce,
      serviceUserUuid: verifySignedRequestInput.userUuid,
    }).then((nonceStored) => {
      if (!nonceStored) {
        throw new UnauthorisedError('Signed request nonce has already been used')
      }
    })
  }

  private parseAllowlistedServiceUuids(allowlistedServiceUuidsRaw: string): Set<string> {
    return new Set(
      allowlistedServiceUuidsRaw
        .split(',')
        .map((entryValue) => {
          return entryValue.trim()
        })
        .filter((entryValue) => {
          return entryValue.length > 0
        })
    )
  }

  constructor(
    private readonly environment: Environment,
    private readonly messageSignatureService: MessageSignatureService = new MessageSignatureService(),
    private readonly requestRateLimiterService: RequestRateLimiterService = new RequestRateLimiterService(environment),
    private readonly requestSecurityRepository: RequestSecurityRepositoryInterface = new PrismaRequestSecurityRepositoryService(),
    private readonly serviceHandleRepository: ServiceHandleRepositoryInterface = new PrismaServiceHandleRepositoryService(),
    private readonly signingKeyCryptoService: SigningKeyCryptoService = new SigningKeyCryptoService(environment)
  ) {
    this.allowlistedServiceUuids = this.parseAllowlistedServiceUuids(environment.ALLOWLISTED_SERVICE_UUIDS)
  }

  async verifySignedRequest(verifySignedRequestInput: VerifySignedRequestInput): Promise<AuthenticatedServiceContext> {
    this.ensureTimestampIsValid(verifySignedRequestInput.timestamp)
    const serviceHandle = await this.serviceHandleRepository.getServiceHandleByUserUuid(verifySignedRequestInput.userUuid)

    if (serviceHandle === null) {
      throw new UnauthorisedError('Service handle not found')
    }

    const serviceHandleRevokedAt = serviceHandle.revokedAt ?? null

    if (serviceHandleRevokedAt !== null) {
      throw new UnauthorisedError('Service handle has been revoked')
    }

    this.ensureServiceHandleIsAllowed(verifySignedRequestInput.userUuid)
    const canonicalRequest = buildCanonicalRequest({
      body: verifySignedRequestInput.body,
      method: verifySignedRequestInput.method,
      nonce: verifySignedRequestInput.nonce,
      requestPath: verifySignedRequestInput.requestPath,
      timestamp: verifySignedRequestInput.timestamp,
    })
    const unrevokedSigningKeys = await this.serviceHandleRepository.getUnrevokedSigningKeysByUserUuid(
      verifySignedRequestInput.userUuid
    )
    const signaturesMatch = unrevokedSigningKeys.some((serviceSigningKeyRecord) => {
      const signingKey = this.signingKeyCryptoService.decryptSigningKey(serviceSigningKeyRecord.encryptedSigningKey)
      const expectedSignature = this.messageSignatureService.createRequestSignature(canonicalRequest, signingKey)

      return this.messageSignatureService.signaturesMatch(expectedSignature, verifySignedRequestInput.signature)
    })

    if (!signaturesMatch) {
      throw new UnauthorisedError('Invalid request signature')
    }

    this.requestRateLimiterService.assertRequestAllowed(
      `${verifySignedRequestInput.userUuid}:${verifySignedRequestInput.clientIp}`
    )
    await this.requestSecurityRepository.deleteExpiredSignedRequestNonces(new Date())
    await this.ensureVerifiedNonce(verifySignedRequestInput)

    return {
      defaultMaxReceiveCount: serviceHandle.defaultMaxReceiveCount,
      defaultVisibilityTimeoutSeconds: serviceHandle.defaultVisibilityTimeoutSeconds,
      userUuid: serviceHandle.userUuid,
    }
  }
}

export { SignedRequestAuthService, type VerifySignedRequestInput }
