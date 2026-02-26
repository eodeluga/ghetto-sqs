type CanonicalRequestInput = {
  body?: unknown
  method: string
  requestPath: string
  timestamp: string
}

const normaliseForStableStringify = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entryValue) => {
      return normaliseForStableStringify(entryValue)
    })
  }

  if (value !== null && typeof value === 'object') {
    const valueRecord = value as Record<string, unknown>
    const sortedEntries = Object.entries(valueRecord).sort((leftEntry, rightEntry) => {
      return leftEntry[0].localeCompare(rightEntry[0])
    })
    const normalisedRecord: Record<string, unknown> = {}

    sortedEntries.forEach(([entryKey, entryValue]) => {
      normalisedRecord[entryKey] = normaliseForStableStringify(entryValue)
    })

    return normalisedRecord
  }

  return value
}

const stableStringify = (value: unknown): string => {
  return JSON.stringify(normaliseForStableStringify(value))
}

const buildCanonicalRequest = (canonicalRequestInput: CanonicalRequestInput): string => {
  const bodyPayload = canonicalRequestInput.body === undefined
    ? ''
    : stableStringify(canonicalRequestInput.body)

  return [
    canonicalRequestInput.method.toUpperCase(),
    canonicalRequestInput.requestPath,
    canonicalRequestInput.timestamp,
    bodyPayload,
  ].join('\n')
}

export { buildCanonicalRequest, stableStringify, type CanonicalRequestInput }
