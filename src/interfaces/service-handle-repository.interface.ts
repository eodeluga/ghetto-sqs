interface CreateServiceHandleInput {
  activeKeyVersion: number
  defaultMaxReceiveCount: number
  defaultVisibilityTimeoutSeconds: number
  encryptedSigningKey: string
  keyVersion: number
  label: string
  userUuid: string
}

interface RotateServiceSigningKeyInput {
  encryptedSigningKey: string
  serviceUserUuid: string
}

interface ServiceHandleRecord {
  activeKeyVersion: number
  createdAt: Date
  defaultMaxReceiveCount: number
  defaultVisibilityTimeoutSeconds: number
  id: string
  label: string
  revokedAt: Date | null
  userUuid: string
}

interface ServiceSigningKeyRecord {
  createdAt: Date
  encryptedSigningKey: string
  id: string
  keyVersion: number
  revokedAt: Date | null
  serviceUserUuid: string
}

interface ServiceHandleRepositoryInterface {
  createServiceHandle(createServiceHandleInput: CreateServiceHandleInput): Promise<ServiceHandleRecord>
  getServiceHandleByLabel(label: string): Promise<ServiceHandleRecord | null>
  getServiceHandleByUserUuid(userUuid: string): Promise<ServiceHandleRecord | null>
  getUnrevokedSigningKeysByUserUuid(userUuid: string): Promise<ServiceSigningKeyRecord[]>
  revokeServiceHandle(userUuid: string): Promise<Date | null>
  rotateServiceSigningKey(rotateServiceSigningKeyInput: RotateServiceSigningKeyInput): Promise<ServiceSigningKeyRecord>
}

export {
  type CreateServiceHandleInput,
  type RotateServiceSigningKeyInput,
  type ServiceHandleRecord,
  type ServiceHandleRepositoryInterface,
  type ServiceSigningKeyRecord,
}
