import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

class MessageSignatureService {
  private createSha256Hash(value: string): string {
    return createHash('sha256').update(value).digest('hex')
  }

  private normaliseHexToBuffer(hexValue: string): Buffer {
    return Buffer.from(hexValue, 'hex')
  }

  createReceiptHandle(): string {
    return randomBytes(32).toString('hex')
  }

  createReceiptHandleHash(receiptHandle: string): string {
    return this.createSha256Hash(receiptHandle)
  }

  createRequestSignature(canonicalRequest: string, signingKey: string): string {
    return createHmac('sha256', signingKey).update(canonicalRequest).digest('hex')
  }

  createSigningKeyHash(signingKey: string): string {
    return this.createSha256Hash(signingKey)
  }

  signaturesMatch(expectedSignature: string, providedSignature: string): boolean {
    const expectedSignatureBuffer = this.normaliseHexToBuffer(expectedSignature)
    const providedSignatureBuffer = this.normaliseHexToBuffer(providedSignature)

    if (expectedSignatureBuffer.length !== providedSignatureBuffer.length) {
      return false
    }

    return timingSafeEqual(expectedSignatureBuffer, providedSignatureBuffer)
  }
}

export { MessageSignatureService }
