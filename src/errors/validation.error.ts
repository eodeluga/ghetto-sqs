import { BaseError } from '@/errors/base.error'

class ValidationError extends BaseError {
  constructor(message: string, details?: unknown, path?: string[]) {
    super({
      code: 'validation_error',
      details,
      message,
      path,
      status: 400,
    })
  }
}

export { ValidationError }
