import { type SystemHealthResponse } from '@/schemas/system-health.schema'

class SystemHealthService {
  getSystemHealth(): SystemHealthResponse {
    return {
      status: 'ok',
    }
  }
}

export { SystemHealthService }
