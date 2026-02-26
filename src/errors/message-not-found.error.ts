import { BaseError } from '@/errors/base.error'

class MessageNotFoundError extends BaseError {
  constructor(message: string, details?: unknown, path?: string[]) {
    super({
      code: 'message_not_found',
      details,
      message,
      path,
      status: 404,
    })
  }
}

export { MessageNotFoundError }
