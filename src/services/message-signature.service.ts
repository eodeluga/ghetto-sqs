import { randomBytes } from 'node:crypto'

class MessageSignatureService {
  createReceiptHandle(): string {
    return randomBytes(32).toString('hex')
  }
}

export { MessageSignatureService }
