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

| Variable | Default | Purpose |
| --- | --- | --- |
| `ALLOWLISTED_SERVICE_UUIDS` | `""` | Optional comma-separated UUID allow list. Empty means allow any registered handle. |
| `DATABASE_URL` | `mongodb://localhost:27017/ghetto_sqs` | MongoDB connection string. |
| `HOST` | `0.0.0.0` | HTTP bind host. |
| `LOG_LEVEL` | `info` | Server log level. |
| `MAX_VISIBILITY_EXTENSIONS` | `20` | Maximum number of visibility timeout extensions allowed per message. |
| `POISON_MESSAGE_RECEIVE_THRESHOLD` | `50` | Maximum receives for messages without DLQ policy before discard. |
| `PORT` | `3000` | HTTP bind port. |
| `QUEUE_MESSAGE_RETENTION_SECONDS` | `345600` | Retention window for queue messages (4 days). |
| `REQUEST_RATE_LIMIT_BAN_AFTER_VIOLATIONS` | `5` | Violations before temporary ban for signed queue requests. |
| `REQUEST_RATE_LIMIT_BAN_SECONDS` | `300` | Temporary ban duration in seconds after rate limit abuse. |
| `REQUEST_RATE_LIMIT_MAX_PER_WINDOW` | `120` | Max signed queue requests per rate-limit window. |
| `REQUEST_RATE_LIMIT_WINDOW_SECONDS` | `60` | Rate-limit rolling window in seconds. |
| `SIGNATURE_NONCE_TTL_SECONDS` | `300` | Nonce replay-protection window in seconds. |
| `SIGNATURE_TOLERANCE_SECONDS` | `300` | Allowed timestamp skew for signed requests. |
| `SIGNING_KEY_MASTER_KEY` | `012345...89abcdef` | 64-char hex master key used to encrypt handle signing keys at rest. |

Example:

```bash
export DATABASE_URL="mongodb://localhost:27017/ghetto_sqs"
export HOST="0.0.0.0"
export LOG_LEVEL="info"
export PORT="3000"
export SIGNATURE_NONCE_TTL_SECONDS="300"
export SIGNATURE_TOLERANCE_SECONDS="300"
export SIGNING_KEY_MASTER_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
```

## Docker Compose

Default compose setup:

```bash
docker compose up -d
```

This uses:

- `docker-compose.yml`
- `.env`

Development compose setup:

```bash
docker compose --env-file .env.dev -f docker-compose.dev.yml up -d
```

This uses:

- `docker-compose.dev.yml`
- `.env.dev`

`.env.dev` is intended for local development credentials that are separate from `.env`.
If you point `.env.dev` at an existing MongoDB instance, ensure that `DATABASE_URL` credentials exist on that instance.

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
- `GET /health/live`
- `GET /health/ready`
- `POST /v1/handles/register`
- `POST /v1/handles/keys/rotate`
- `POST /v1/handles/revoke`
- `POST /v1/queues/:queueName/messages`
- `GET /v1/queues/:queueName/messages/receive`
- `DELETE /v1/queues/:queueName/messages/:messageId`
- `POST /v1/queues/:queueName/messages/:messageId/visibility`

Queue endpoints require signed headers:

- `x-gsqs-nonce`
- `x-gsqs-user-uuid`
- `x-gsqs-timestamp`
- `x-gsqs-signature`

Common API error status codes:

- `401 unauthorised` for invalid signatures, timestamps, nonces, revoked handles, or allow-list denial.
- `429 rate_limited` when request rate limits are exceeded.
- `503 service_unavailable` when readiness checks fail.

## Security Controls

- Handle signing keys are encrypted at rest with `SIGNING_KEY_MASTER_KEY`.
- Signed requests require nonce uniqueness per handle (`x-gsqs-nonce`) to block replay.
- Request rate limiting is enforced by `(handle, ip)` with temporary bans for repeated abuse.
- Optional allow-listing can be enforced with `ALLOWLISTED_SERVICE_UUIDS`.

## Handle Defaults

During `POST /v1/handles/register`, you can optionally set service-level defaults:

- `defaultVisibilityTimeoutSeconds` (default: `30`)
- `defaultMaxReceiveCount` (default: `5`)
- `label` must be unique per registered handle. Duplicate labels return `409 already_registered`.

Terminology:

- `visibility timeout` controls how long a received message stays hidden before it can reappear.
- `max receive count` controls how many receives are allowed before DLQ redrive.

## Handle Security Endpoints

- `POST /v1/handles/keys/rotate` rotates the current handle signing key and immediately revokes all other active key versions.
- `POST /v1/handles/revoke` revokes the current handle and all of its signing keys.

## FIFO Support

- FIFO queue names must end with `.fifo`.
- FIFO enqueues require `messageGroupId`.
- Optional FIFO deduplication uses `messageDeduplicationId`.
- Deduplication window is 5 minutes per queue + service handle + deduplication ID.

## DLQ Support

DLQ policy is attached per message during enqueue:

- `deadLetterQueueName`
- `maxReceiveCount` (optional override)

Rules:

- `deadLetterQueueName` must differ from source queue name.
- If `maxReceiveCount` is omitted, the handle `defaultMaxReceiveCount` is used.
- When `receiveCount >= maxReceiveCount`, the message is moved to DLQ before next delivery attempt.

## Queue Durability Controls

- Queue retention policy is enforced with `QUEUE_MESSAGE_RETENTION_SECONDS`.
- Visibility timeout changes per message are capped by `MAX_VISIBILITY_EXTENSIONS`.
- Messages without DLQ policy are treated as poison messages and discarded after `POISON_MESSAGE_RECEIVE_THRESHOLD` receives.

## Signing Example

Signature canonical payload format:

```text
<HTTP_METHOD>\n<REQUEST_PATH_WITH_QUERY>\n<NONCE>\n<TIMESTAMP_MS>\n<STABLE_JSON_BODY_OR_EMPTY_STRING>
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

const signRequest = (
  method: string,
  nonce: string,
  path: string,
  body: unknown,
  timestamp: string,
  signingKey: string
): string => {
  const bodyPayload = body === undefined
    ? ''
    : JSON.stringify(stableSort(body))
  const canonical = [method.toUpperCase(), path, nonce, timestamp, bodyPayload].join('\n')

  return createHmac('sha256', signingKey).update(canonical).digest('hex')
}
```

## End-To-End Examples

1. Register a handle:

```bash
curl -sS -X POST http://localhost:3000/v1/handles/register \
  -H 'content-type: application/json' \
  -d '{"label":"payments-worker","defaultVisibilityTimeoutSeconds":45,"defaultMaxReceiveCount":4}'
```

2. Enqueue standard queue message with DLQ policy:

```bash
curl -sS -X POST http://localhost:3000/v1/queues/jobs/messages \
  -H 'content-type: application/json' \
  -H "x-gsqs-nonce: <NONCE>" \
  -H "x-gsqs-user-uuid: <USER_UUID>" \
  -H "x-gsqs-timestamp: <TIMESTAMP_MS>" \
  -H "x-gsqs-signature: <SIGNATURE_HEX>" \
  -d '{"body":{"jobId":"job-123"},"delaySeconds":0,"deadLetterQueueName":"jobs-dlq","maxReceiveCount":3}'
```

3. Enqueue FIFO queue message:

```bash
curl -sS -X POST http://localhost:3000/v1/queues/orders.fifo/messages \
  -H 'content-type: application/json' \
  -H "x-gsqs-nonce: <NONCE>" \
  -H "x-gsqs-user-uuid: <USER_UUID>" \
  -H "x-gsqs-timestamp: <TIMESTAMP_MS>" \
  -H "x-gsqs-signature: <SIGNATURE_HEX>" \
  -d '{"body":{"orderId":"order-123"},"delaySeconds":0,"messageGroupId":"orders","messageDeduplicationId":"order-123-create"}'
```

4. Receive messages:

```bash
curl -sS "http://localhost:3000/v1/queues/jobs/messages/receive?maxMessages=1" \
  -H "x-gsqs-nonce: <NONCE>" \
  -H "x-gsqs-user-uuid: <USER_UUID>" \
  -H "x-gsqs-timestamp: <TIMESTAMP_MS>" \
  -H "x-gsqs-signature: <SIGNATURE_HEX>"
```

5. Delete a message with receipt handle:

```bash
curl -sS -X DELETE http://localhost:3000/v1/queues/jobs/messages/<MESSAGE_ID> \
  -H 'content-type: application/json' \
  -H "x-gsqs-nonce: <NONCE>" \
  -H "x-gsqs-user-uuid: <USER_UUID>" \
  -H "x-gsqs-timestamp: <TIMESTAMP_MS>" \
  -H "x-gsqs-signature: <SIGNATURE_HEX>" \
  -d '{"receiptHandle":"<RECEIPT_HANDLE>"}'
```

## Operations Runbooks

- [Backup And Restore](docs/operations/backup-and-restore.md)
- [Schema And Index Rollout](docs/operations/schema-and-index-rollout.md)
