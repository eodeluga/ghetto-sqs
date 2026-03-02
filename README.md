# Ghetto SQS

Ghetto SQS is a lightweight, self-hostable SQS-compatible queue server built with Fastify, Prisma, MongoDB, and Zod.

## Requirements

- Bun `>=1.3`
- Node.js `>=22`
- MongoDB database (local or remote)

## Install

```bash
bun install
```

## Environment

Copy `.env.example` into your runtime environment.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `mongodb://localhost:27017/ghetto_sqs` | MongoDB connection string. |
| `HOST` | `0.0.0.0` | HTTP bind host. |
| `LOG_LEVEL` | `info` | Server log level. |
| `MAX_VISIBILITY_EXTENSIONS` | `20` | Maximum number of visibility timeout extensions allowed per message. |
| `POISON_MESSAGE_RECEIVE_THRESHOLD` | `50` | Maximum receives for messages without DLQ policy before discard. |
| `PORT` | `3000` | HTTP bind port. |
| `QUEUE_MESSAGE_RETENTION_SECONDS` | `345600` | Retention window for queue messages (4 days). |

Example:

```bash
export DATABASE_URL="mongodb://localhost:27017/ghetto_sqs"
export HOST="0.0.0.0"
export LOG_LEVEL="info"
export PORT="3000"
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

## Release Hardening Checklist

Before release, run:

```bash
bun run lint
bun run typecheck
bun run test
bun run build
```

## OpenAPI

Complete API documentation is defined in `openapi/openapi.yaml`.

## API Summary

- `GET /health`
- `GET /health/live`
- `GET /health/ready`
- `POST /v1/queues/:queueName/messages`
- `GET /v1/queues/:queueName/messages/receive`
- `DELETE /v1/queues/:queueName/messages`
- `POST /v1/queues/:queueName/messages/visibility`

Queue operations are authless. No registration flow or signed headers are required.

## SQS-Compatible Lifecycle

- `ReceiveMessage` returns a fresh `receiptHandle` per delivery.
- A message is in-flight until `visibilityExpiresAt`.
- When visibility expires, the old receipt handle is invalidated.
- Delete requires the active receipt handle for the current in-flight delivery.
- Deleting with a stale or random receipt handle returns `400 receipt_handle_invalid`.

## FIFO Support

- FIFO queue names must end with `.fifo`.
- FIFO enqueue requires `messageGroupId`.
- Optional FIFO deduplication uses `messageDeduplicationId`.
- Deduplication window is 5 minutes per queue and deduplication ID.

## DLQ Support

DLQ policy is attached per message during enqueue:

- `deadLetterQueueName`
- `maxReceiveCount` (optional override)

Rules:

- `deadLetterQueueName` must differ from source queue name.
- If `maxReceiveCount` is omitted, server default max receive count is used.
- When receive count reaches `maxReceiveCount`, the message is moved to the DLQ before the next delivery attempt.

## End-To-End Examples

1. Send a message:

```bash
curl -sS -X POST http://localhost:3000/v1/queues/jobs/messages \
  -H 'content-type: application/json' \
  -d '{"body":{"jobId":"job-123"},"delaySeconds":0}'
```

2. Receive a message:

```bash
curl -sS "http://localhost:3000/v1/queues/jobs/messages/receive?maxMessages=1&visibilityTimeoutSeconds=30"
```

Example receive payload:

```json
{
  "messages": [
    {
      "approximateReceiveCount": 1,
      "body": {
        "jobId": "job-123"
      },
      "messageId": "67c211ef6c3e16a6c5fd72f1",
      "queueName": "jobs",
      "receiptHandle": "a88d51d0564ab5f6d264f250469dc64f24741e7e99fddc04da7f364e81f87397",
      "visibilityExpiresAt": "2026-03-01T21:25:00.000Z"
    }
  ]
}
```

3. Delete with receipt handle:

```bash
curl -sS -X DELETE http://localhost:3000/v1/queues/jobs/messages \
  -H 'content-type: application/json' \
  -d '{"receiptHandle":"<RECEIPT_HANDLE>"}'
```

4. Change visibility timeout with receipt handle:

```bash
curl -sS -X POST http://localhost:3000/v1/queues/jobs/messages/visibility \
  -H 'content-type: application/json' \
  -d '{"receiptHandle":"<RECEIPT_HANDLE>","visibilityTimeoutSeconds":60}'
```
