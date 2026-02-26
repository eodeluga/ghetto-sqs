interface CreateServiceHandleInput {
  defaultMaxReceiveCount: number
  defaultVisibilityTimeoutSeconds: number
  label: string
  signingKey: string
  signingKeyHash: string
  userUuid: string
}

interface ServiceHandleRecord {
  createdAt: Date
  defaultMaxReceiveCount: number
  defaultVisibilityTimeoutSeconds: number
  id: string
  label: string
  signingKey: string
  signingKeyHash: string
  userUuid: string
}

interface ServiceHandleRepositoryInterface {
  createServiceHandle(createServiceHandleInput: CreateServiceHandleInput): Promise<ServiceHandleRecord>
  getServiceHandleByLabel(label: string): Promise<ServiceHandleRecord | null>
  getServiceHandleByUserUuid(userUuid: string): Promise<ServiceHandleRecord | null>
}

export {
  type CreateServiceHandleInput,
  type ServiceHandleRecord,
  type ServiceHandleRepositoryInterface,
}
