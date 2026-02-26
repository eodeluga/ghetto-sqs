import { BaseError } from '@/errors/base.error'

class AlreadyRegisteredError extends BaseError {
  constructor(message: string, details?: unknown, path?: string[]) {
    super({
      code: 'already_registered',
      details,
      message,
      path,
      status: 409,
    })
  }
}

export { AlreadyRegisteredError }
