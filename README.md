# Ghetto SQS

Ghetto SQS is a lightweight, self-hostable, AWS SQS-compatible queue server built with Fastify, Prisma, MongoDB, and Zod.

## Requirements

- Bun `>=1.3`
- Node.js `>=22`
- MongoDB database (local or remote)

## Install

```bash
bun install
```

## Environment

Copy `.env.example` into your runtime environment:

- `DATABASE_URL`
- `HOST`
- `LOG_LEVEL`
- `PORT`
- `SIGNATURE_TOLERANCE_SECONDS`

Example:

```bash
export DATABASE_URL="mongodb://localhost:27017/ghetto_sqs"
export HOST="0.0.0.0"
export LOG_LEVEL="info"
export PORT="3000"
export SIGNATURE_TOLERANCE_SECONDS="300"
```

## Build And Run

Development mode:

```bash
bun run dev
```

Type checking:

```bash
bun run typecheck
```

Lint:

```bash
bun run lint
```

Tests:

```bash
bun run test
```

Compile:

```bash
bun run build
```

Start server:

```bash
bun run start
```

## OpenAPI

Complete API documentation is defined at:

- `openapi/openapi.yaml`

## API Summary

- `GET /health`
- `POST /v1/handles/register`
- `POST /v1/queues/:queueName/messages`
- `GET /v1/queues/:queueName/messages/receive`
- `DELETE /v1/queues/:queueName/messages/:messageId`
- `POST /v1/queues/:queueName/messages/:messageId/visibility`

Queue endpoints require signed headers:

- `x-gsqs-user-uuid`
- `x-gsqs-timestamp`
- `x-gsqs-signature`

## Signing Example

Signature canonical payload format:

```text
<HTTP_METHOD>\n<REQUEST_PATH_WITH_QUERY>\n<TIMESTAMP_MS>\n<STABLE_JSON_BODY_OR_EMPTY_STRING>
```

Example signer (Node.js):

```ts
import { createHmac } from 'node:crypto'

const stableSort = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entryValue) => stableSort(entryValue))
  }

  if (value !== null && typeof value === 'object') {
    const valueRecord = value as Record<string, unknown>
    const sortedEntries = Object.entries(valueRecord).sort((leftEntry, rightEntry) => {
      return leftEntry[0].localeCompare(rightEntry[0])
    })
    const normalisedRecord: Record<string, unknown> = {}

    sortedEntries.forEach(([entryKey, entryValue]) => {
      normalisedRecord[entryKey] = stableSort(entryValue)
    })

    return normalisedRecord
  }

  return value
}

const signRequest = (method: string, path: string, body: unknown, timestamp: string, signingKey: string): string => {
  const bodyPayload = body === undefined
    ? ''
    : JSON.stringify(stableSort(body))
  const canonical = [method.toUpperCase(), path, timestamp, bodyPayload].join('\n')

  return createHmac('sha256', signingKey).update(canonical).digest('hex')
}
```

## End-To-End Example

1. Register a handle:

```bash
curl -sS -X POST http://localhost:3000/v1/handles/register \
  -H 'content-type: application/json' \
  -d '{"label":"payments-worker"}'
```

Response example:

```text
{"userUuid":"...","signingKey":"..."}
```

2. Enqueue a message with signed headers:

```bash
curl -sS -X POST http://localhost:3000/v1/queues/jobs/messages \
  -H 'content-type: application/json' \
  -H "x-gsqs-user-uuid: <USER_UUID>" \
  -H "x-gsqs-timestamp: <TIMESTAMP_MS>" \
  -H "x-gsqs-signature: <SIGNATURE_HEX>" \
  -d '{"body":{"jobId":"job-123"},"delaySeconds":0}'
```

3. Receive messages:

```bash
curl -sS "http://localhost:3000/v1/queues/jobs/messages/receive?maxMessages=1&visibilityTimeoutSeconds=30" \
  -H "x-gsqs-user-uuid: <USER_UUID>" \
  -H "x-gsqs-timestamp: <TIMESTAMP_MS>" \
  -H "x-gsqs-signature: <SIGNATURE_HEX>"
```

4. Delete the message with receipt handle:

```bash
curl -sS -X DELETE http://localhost:3000/v1/queues/jobs/messages/<MESSAGE_ID> \
  -H 'content-type: application/json' \
  -H "x-gsqs-user-uuid: <USER_UUID>" \
  -H "x-gsqs-timestamp: <TIMESTAMP_MS>" \
  -H "x-gsqs-signature: <SIGNATURE_HEX>" \
  -d '{"receiptHandle":"<RECEIPT_HANDLE>"}'
```
