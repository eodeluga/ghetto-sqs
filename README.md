# Ghetto SQS

Ghetto SQS is a lightweight, self-hostable SQS-compatible server built with Fastify.

## Setup

```bash
bun install
```

## Scripts

```bash
bun run dev
bun run build
bun run start
bun run lint
bun run typecheck
```

## Environment

Copy `.env.example` values into your runtime environment:

- `DATABASE_URL`
- `HOST`
- `LOG_LEVEL`
- `PORT`

## Initial Route Skeleton

- `GET /health`
- `POST /v1/handles/register`

## Source Layout

- `src/handlers`
- `src/middleware`
- `src/route-groups`
- `src/schemas`
- `src/services`
- `src/utils`
- `src/routes.ts`
