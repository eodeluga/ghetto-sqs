import { BaseError } from '@/errors/base.error'

class UnauthorisedError extends BaseError {
  constructor(message: string, details?: unknown, path?: string[]) {
    super({
      code: 'unauthorised',
      details,
      message,
      path,
      status: 401,
    })
  }
}

export { UnauthorisedError }
