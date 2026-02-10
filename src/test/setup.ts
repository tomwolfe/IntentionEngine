import '@testing-library/jest-dom'
import { beforeAll, afterEach, afterAll, vi } from 'vitest'
import { setupServer } from 'msw/node'

// Set dummy environment variables
process.env.LLM_API_KEY = 'test_key'
process.env.LLM_BASE_URL = 'https://test.api'
process.env.UPSTASH_REDIS_REST_URL = 'https://test.redis'
process.env.UPSTASH_REDIS_REST_TOKEN = 'test_token'

export const server = setupServer()

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
