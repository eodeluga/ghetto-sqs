type BaseErrorInput = {
  code: string
  details?: unknown
  message: string
  path?: string[]
  status: number
}

class BaseError extends Error {
  code: string
  details?: unknown
  path?: string[]
  status: number

  constructor(baseErrorInput: BaseErrorInput) {
    super(baseErrorInput.message)
    this.code = baseErrorInput.code
    this.details = baseErrorInput.details
    this.name = new.target.name
    this.status = baseErrorInput.status

    if (baseErrorInput.path !== undefined) {
      this.path = baseErrorInput.path
    }
  }
}

export { BaseError, type BaseErrorInput }
