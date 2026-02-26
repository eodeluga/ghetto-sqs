import { randomUUID } from 'node:crypto'
import { buildCanonicalRequest } from '@/utils/canonical-request.util'
import { MessageSignatureService } from '@/services/message-signature.service'

type SignedHeadersInput = {
  body?: unknown
  method: string
  nonce?: string
  requestPath: string
  signingKey: string
  timestamp?: string
  userUuid: string
}

const createSignedHeaders = (
  signedHeadersInput: SignedHeadersInput,
  messageSignatureService: MessageSignatureService = new MessageSignatureService(),
): Record<string, string> => {
  const nonce = signedHeadersInput.nonce ?? randomUUID().replaceAll('-', '')
  const timestamp = signedHeadersInput.timestamp ?? Date.now().toString()
  const canonicalRequest = buildCanonicalRequest({
    body: signedHeadersInput.body,
    method: signedHeadersInput.method,
    nonce,
    requestPath: signedHeadersInput.requestPath,
    timestamp,
  })
  const signature = messageSignatureService.createRequestSignature(canonicalRequest, signedHeadersInput.signingKey)

  return {
    'x-gsqs-nonce': nonce,
    'x-gsqs-signature': signature,
    'x-gsqs-timestamp': timestamp,
    'x-gsqs-user-uuid': signedHeadersInput.userUuid,
  }
}

export { createSignedHeaders, type SignedHeadersInput }
