import { type Environment, readEnvironment } from '@/config/environment'
import { RateLimitedError } from '@/errors'

type RequestRateLimitState = {
  bannedUntilTimestampMs: number | null
  violationCount: number
  windowRequestCount: number
  windowStartedAtTimestampMs: number
}

class RequestRateLimiterService {
  private readonly stateByKey = new Map<string, RequestRateLimitState>()

  constructor(private readonly environment: Environment = readEnvironment()) {}

  assertRequestAllowed(rateLimitKey: string): void {
    const nowTimestampMs = Date.now()
    const existingState = this.stateByKey.get(rateLimitKey)
    const currentState: RequestRateLimitState = existingState ?? {
      bannedUntilTimestampMs: null,
      violationCount: 0,
      windowRequestCount: 0,
      windowStartedAtTimestampMs: nowTimestampMs,
    }

    if (currentState.bannedUntilTimestampMs !== null && currentState.bannedUntilTimestampMs > nowTimestampMs) {
      throw new RateLimitedError('Request temporarily blocked due to repeated rate limit violations')
    }

    const windowDurationMs = this.environment.REQUEST_RATE_LIMIT_WINDOW_SECONDS * 1000

    if ((nowTimestampMs - currentState.windowStartedAtTimestampMs) >= windowDurationMs) {
      currentState.windowRequestCount = 0
      currentState.windowStartedAtTimestampMs = nowTimestampMs
    }

    currentState.windowRequestCount += 1

    if (currentState.windowRequestCount <= this.environment.REQUEST_RATE_LIMIT_MAX_PER_WINDOW) {
      this.stateByKey.set(rateLimitKey, currentState)
      return
    }

    currentState.violationCount += 1

    if (currentState.violationCount >= this.environment.REQUEST_RATE_LIMIT_BAN_AFTER_VIOLATIONS) {
      currentState.bannedUntilTimestampMs = nowTimestampMs + (this.environment.REQUEST_RATE_LIMIT_BAN_SECONDS * 1000)
      currentState.violationCount = 0
    }

    this.stateByKey.set(rateLimitKey, currentState)
    throw new RateLimitedError('Rate limit exceeded')
  }
}

export { RequestRateLimiterService, type RequestRateLimitState }
