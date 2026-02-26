import { type DatabaseHealthCheckerInterface } from '@/interfaces/database-health-checker.interface'
import { type SystemHealthResponse, type SystemReadinessResponse } from '@/schemas/system-health.schema'
import { PrismaClientService } from '@/services/prisma-client.service'

class SystemHealthService {
  constructor(private readonly databaseHealthChecker: DatabaseHealthCheckerInterface = new PrismaClientService()) {}

  getSystemHealth(): SystemHealthResponse {
    return {
      status: 'ok',
    }
  }

  async getSystemReadiness(): Promise<SystemReadinessResponse> {
    try {
      await this.databaseHealthChecker.ping()

      return {
        status: 'ready',
      }
    } catch {
      return {
        status: 'not_ready',
      }
    }
  }
}

export { SystemHealthService }
