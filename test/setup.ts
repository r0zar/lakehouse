// Test setup file - load Next.js environment variables
import './env-config'
import { beforeAll } from 'vitest'

beforeAll(() => {
  // Validate required environment variables
  if (!process.env.GOOGLE_CLOUD_PROJECT) {
    throw new Error('GOOGLE_CLOUD_PROJECT environment variable is required for tests')
  }
  
  if (!process.env.GOOGLE_CLOUD_CREDENTIALS) {
    throw new Error('GOOGLE_CLOUD_CREDENTIALS environment variable is required for tests')
  }
  
  console.log(`🧪 Running tests against project: ${process.env.GOOGLE_CLOUD_PROJECT}`)
})