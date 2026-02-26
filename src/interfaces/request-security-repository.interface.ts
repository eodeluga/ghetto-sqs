interface CreateAuditEventInput {
  action: string
  actorServiceUserUuid?: string
  details?: unknown
  targetId: string
  targetType: string
}

interface StoreSignedRequestNonceInput {
  expiresAt: Date
  nonce: string
  serviceUserUuid: string
}

interface RequestSecurityRepositoryInterface {
  createAuditEvent(createAuditEventInput: CreateAuditEventInput): Promise<void>
  deleteExpiredSignedRequestNonces(expiredAtOrBefore: Date): Promise<number>
  storeSignedRequestNonce(storeSignedRequestNonceInput: StoreSignedRequestNonceInput): Promise<boolean>
}

export {
  type CreateAuditEventInput,
  type RequestSecurityRepositoryInterface,
  type StoreSignedRequestNonceInput,
}
