import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { type Environment, readEnvironment } from '@/config/environment'

class SigningKeyCryptoService {
  private readonly masterKeyBuffer: Buffer

  constructor(private readonly environment: Environment = readEnvironment()) {
    this.masterKeyBuffer = Buffer.from(environment.SIGNING_KEY_MASTER_KEY, 'hex')
  }

  decryptSigningKey(encryptedSigningKey: string): string {
    const [ivHex, cipherTextHex, authTagHex] = encryptedSigningKey.split(':')

    if (ivHex === undefined || cipherTextHex === undefined || authTagHex === undefined) {
      throw new Error('Invalid encrypted signing key payload')
    }

    const ivBuffer = Buffer.from(ivHex, 'hex')
    const authTagBuffer = Buffer.from(authTagHex, 'hex')
    const cipherTextBuffer = Buffer.from(cipherTextHex, 'hex')
    const decipher = createDecipheriv('aes-256-gcm', this.masterKeyBuffer, ivBuffer)

    decipher.setAuthTag(authTagBuffer)

    const decryptedBuffer = Buffer.concat([decipher.update(cipherTextBuffer), decipher.final()])

    return decryptedBuffer.toString('utf8')
  }

  encryptSigningKey(signingKey: string): string {
    const ivBuffer = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.masterKeyBuffer, ivBuffer)
    const encryptedBuffer = Buffer.concat([cipher.update(signingKey, 'utf8'), cipher.final()])
    const authTagBuffer = cipher.getAuthTag()

    return `${ivBuffer.toString('hex')}:${encryptedBuffer.toString('hex')}:${authTagBuffer.toString('hex')}`
  }
}

export { SigningKeyCryptoService }
