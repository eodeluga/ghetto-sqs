interface DatabaseHealthCheckerInterface {
  ping(): Promise<void>
}

export { type DatabaseHealthCheckerInterface }
