import { BaseError } from '@/errors/base.error'

class ServiceUnavailableError extends BaseError {
  constructor(message: string, details?: unknown, path?: string[]) {
    super({
      code: 'service_unavailable',
      details,
      message,
      path,
      status: 503,
    })
  }
}

export { ServiceUnavailableError }
