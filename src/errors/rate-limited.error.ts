import { BaseError } from '@/errors/base.error'

class RateLimitedError extends BaseError {
  constructor(message: string, details?: unknown, path?: string[]) {
    super({
      code: 'rate_limited',
      details,
      message,
      path,
      status: 429,
    })
  }
}

export { RateLimitedError }
