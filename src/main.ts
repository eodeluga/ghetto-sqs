import { startServer } from '@/server'

startServer().catch((error: unknown) => {
  const message = error instanceof Error
    ? error.message
    : 'Unknown startup error'

  console.error(`Server startup failed: ${message}`)
  process.exitCode = 1
})
