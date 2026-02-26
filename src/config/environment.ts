import { environmentSchema, type Environment } from '@/config/environment.schema'

const readEnvironment = (): Environment => {
  const parseResult = environmentSchema.safeParse(process.env)

  if (!parseResult.success) {
    throw new Error(`Invalid environment configuration: ${parseResult.error.message}`)
  }

  return parseResult.data
}

export { readEnvironment, type Environment }
