import { type Environment } from '@/config/environment'
import { UnauthorisedError } from '@/errors'
import { type ServiceHandleRepositoryInterface } from '@/interfaces/service-handle-repository.interface'
import { MessageSignatureService } from '@/services/message-signature.service'
import { PrismaServiceHandleRepositoryService } from '@/services/prisma-service-handle-repository.service'
import { buildCanonicalRequest } from '@/utils/canonical-request.util'

type VerifySignedRequestInput = {
  body?: unknown
  method: string
  requestPath: string
  signature: string
  timestamp: string
  userUuid: string
}

class SignedRequestAuthService {
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

  constructor(
    private readonly environment: Environment,
    private readonly messageSignatureService: MessageSignatureService = new MessageSignatureService(),
    private readonly serviceHandleRepository: ServiceHandleRepositoryInterface = new PrismaServiceHandleRepositoryService()
  ) {}

  async verifySignedRequest(verifySignedRequestInput: VerifySignedRequestInput): Promise<void> {
    this.ensureTimestampIsValid(verifySignedRequestInput.timestamp)
    const serviceHandle = await this.serviceHandleRepository.getServiceHandleByUserUuid(verifySignedRequestInput.userUuid)

    if (serviceHandle === null) {
      throw new UnauthorisedError('Service handle not found')
    }

    const canonicalRequest = buildCanonicalRequest({
      body: verifySignedRequestInput.body,
      method: verifySignedRequestInput.method,
      requestPath: verifySignedRequestInput.requestPath,
      timestamp: verifySignedRequestInput.timestamp,
    })
    const expectedSignature = this.messageSignatureService.createRequestSignature(canonicalRequest, serviceHandle.signingKey)
    const signaturesMatch = this.messageSignatureService.signaturesMatch(expectedSignature, verifySignedRequestInput.signature)

    if (!signaturesMatch) {
      throw new UnauthorisedError('Invalid request signature')
    }
  }
}

export { SignedRequestAuthService, type VerifySignedRequestInput }
