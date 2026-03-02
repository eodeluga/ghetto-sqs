import { BaseError } from '@/errors/base.error'

class ReceiptHandleInvalidError extends BaseError {
  constructor(message: string, details?: unknown, path?: string[]) {
    super({
      code: 'receipt_handle_invalid',
      details,
      message,
      path,
      status: 400,
    })
  }
}

export { ReceiptHandleInvalidError }
