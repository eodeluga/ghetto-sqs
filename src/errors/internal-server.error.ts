import { BaseError } from '@/errors/base.error'

class InternalServerError extends BaseError {
  constructor(message: string, details?: unknown, path?: string[]) {
    super({
      code: 'internal_server_error',
      details,
      message,
      path,
      status: 500,
    })
  }
}

export { InternalServerError }
