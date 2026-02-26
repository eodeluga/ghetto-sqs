import { buildCanonicalRequest } from '@/utils/canonical-request.util'
import { MessageSignatureService } from '@/services/message-signature.service'

type SignedHeadersInput = {
  body?: unknown
  method: string
  requestPath: string
  signingKey: string
  timestamp?: string
  userUuid: string
}

const createSignedHeaders = (
  signedHeadersInput: SignedHeadersInput,
  messageSignatureService: MessageSignatureService = new MessageSignatureService(),
): Record<string, string> => {
  const timestamp = signedHeadersInput.timestamp ?? Date.now().toString()
  const canonicalRequest = buildCanonicalRequest({
    body: signedHeadersInput.body,
    method: signedHeadersInput.method,
    requestPath: signedHeadersInput.requestPath,
    timestamp,
  })
  const signature = messageSignatureService.createRequestSignature(canonicalRequest, signedHeadersInput.signingKey)

  return {
    'x-gsqs-signature': signature,
    'x-gsqs-timestamp': timestamp,
    'x-gsqs-user-uuid': signedHeadersInput.userUuid,
  }
}

export { createSignedHeaders, type SignedHeadersInput }
