import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const vitestConfig = defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
  },
})

export default vitestConfig
