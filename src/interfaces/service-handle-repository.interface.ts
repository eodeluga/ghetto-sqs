interface CreateServiceHandleInput {
  label: string
  signingKey: string
  signingKeyHash: string
  userUuid: string
}

interface ServiceHandleRecord {
  createdAt: Date
  id: string
  label: string
  signingKey: string
  signingKeyHash: string
  userUuid: string
}

interface ServiceHandleRepositoryInterface {
  createServiceHandle(createServiceHandleInput: CreateServiceHandleInput): Promise<ServiceHandleRecord>
  getServiceHandleByUserUuid(userUuid: string): Promise<ServiceHandleRecord | null>
}

export {
  type CreateServiceHandleInput,
  type ServiceHandleRecord,
  type ServiceHandleRepositoryInterface,
}
