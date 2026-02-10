# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2026-02-09

### Security (Phase 4)

#### Added
- **CORS Configuration**: Added CORS headers to API routes in `next.config.js`
  - Configurable via `ALLOWED_ORIGINS` environment variable
  - Supports `GET`, `POST`, and `OPTIONS` methods
  - Prevents cross-origin abuse in production

- **Rate Limiting**: Implemented API rate limiting using Upstash Redis
  - 100 requests per hour per IP address
  - Sliding window algorithm for fair distribution
  - Returns 429 status with helpful error message when limit exceeded
  - Health check endpoint (`/api/health`) excluded from rate limiting

- **Input Sanitization**: Added XSS prevention to all Zod validation schemas
  - Removes `<` and `>` characters to prevent HTML injection
  - Strips `javascript:` protocol from strings
  - Removes event handlers like `onclick=`
  - Applied to all user input fields including intent queries, locations, and descriptions

### Session & Cache Isolation (Phase 2)

#### Added
- **Session ID Generation**: Each user session now has a unique UUID
  - Generated on component mount in `page.tsx`
  - Persists for the duration of the session
  - Passed to all API requests for cache isolation

- **Session-Aware Cache Keys**: Redis cache keys now include session prefix
  - Format: `session:{sessionId}:{resource}:{params}`
  - Prevents data leakage between different users
  - Backward compatible with existing non-session keys

- **Cache TTL Configuration**: Standardized TTL values for different data types
  - Restaurant cache: 24 hours (`CACHE_TTLS.RESTAURANTS`)
  - Audit logs: 30 days (`CACHE_TTLS.AUDIT_LOGS`)
  - Vibe memory: 7 days (`CACHE_TTLS.VIBE_MEMORY`)
  - Session context: 1 hour (`CACHE_TTLS.SESSION_CONTEXT`)

- **Redis Cleanup Script**: Created maintenance script at `src/scripts/redis-cleanup.ts`
  - Scans all keys and applies appropriate TTLs
  - Can be run via cron (recommended: daily at 2am)
  - Handles keys without TTL by applying defaults based on key pattern

### State Machine Refactoring (Phase 1)

#### Added
- **ExecutionEngine Class**: New state machine for tool execution
  - Extracted from `runAutomatedChain()` in `page.tsx`
  - Reduces component complexity from 180+ lines to ~50 lines
  - Provides clear callback interface for step execution events
  - Includes comprehensive error handling and recovery

- **Execution Callbacks**: Event-driven architecture for execution monitoring
  - `onStepStart`: Triggered when a step begins execution
  - `onStepComplete`: Triggered when a step completes successfully
  - `onStepError`: Triggered when a step fails
  - `onChainComplete`: Triggered when entire chain finishes

- **Unit Tests**: Comprehensive test suite for ExecutionEngine
  - Happy path: Restaurant → calendar event flow
  - Failure recovery: Step 2 fails, chain halts gracefully
  - Wine shop whisper trigger conditions
  - Offline mode fallback handling
  - Session context update validation

#### Changed
- **Simplified page.tsx**: `runAutomatedChain` now delegates to ExecutionEngine
  - Better separation of concerns
  - Easier to test and maintain
  - Reduced cognitive load for developers

### Observability (Phase 6)

#### Added
- **Structured Logging**: JSON-formatted logs for production monitoring
  - `src/lib/logger.ts` provides consistent logging interface
  - Development mode: Human-readable format
  - Production mode: JSON format with timestamps
  - Supports `info`, `error`, `warn`, and `debug` levels
  - Automatically includes stack traces for errors

- **Execution Timing**: Audit logs now include per-step execution times
  - Tracks duration for each tool execution
  - Includes timestamps for each step
  - Total chain execution time logged

- **Health Check Endpoint**: `/api/health` for monitoring service status
  - Returns 200 when all services healthy
  - Returns 503 when services degraded
  - Checks Redis connectivity, LLM API configuration, and Upstash credentials
  - Includes response time and service status for each dependency

### Error Recovery (Phase 3)

#### Added
- **Error Categorization**: Automatic classification of errors
  - `NETWORK_FAILURE`: Connection issues, fetch failures
  - `RATE_LIMIT`: API rate limiting (429 errors)
  - `TOOL_UNAVAILABLE`: Circuit breaker open, service unavailable
  - `VALIDATION_ERROR`: Invalid input, bad requests
  - `OFFLINE`: No network connection detected
  - `TIMEOUT`: Request timeouts
  - `UNKNOWN`: Uncategorized errors

- **User-Friendly Error Messages**: Clear, actionable error messages
  - Network issues: "Connection lost. Please check your network and try again."
  - Rate limiting: "Too many requests. Please wait a moment and try again."
  - Service unavailable: "This service is temporarily unavailable. Try a simpler query or try again later."
  - Offline mode: "You're currently offline. Please check your connection and try again."

- **Retry Functionality**: Users can retry failed intents
  - Retry button appears in error UI
  - Only shown for retryable errors (network, rate limit, timeout)
  - Automatically re-executes the last user intent
  - Clears error state before retry

- **Network Detection**: Proactive offline detection
  - Checks `navigator.onLine` before network-dependent steps
  - Prevents starting chains that require connectivity when offline
  - Graceful degradation with appropriate error messages

### Performance (Phase 5)

#### Added
- **Bundle Analyzer**: Webpack bundle analysis tool
  - Run with `ANALYZE=true npm run build`
  - Generates visual report of bundle composition
  - Helps identify large dependencies for optimization

#### Changed
- **WebLLM Preloading**: Model preloading on app mount already implemented
  - Phi-3.5-mini-instruct-q4f16_1-MLC model loads on startup
  - Reduces latency for first user query
  - Non-blocking initial load

## Migration Guide

### Environment Variables

Add the following to your `.env` file:

```bash
# CORS Configuration
ALLOWED_ORIGINS=https://yourdomain.com

# Existing required variables
LLM_API_KEY=your_api_key_here
LLM_BASE_URL=https://api.z.ai/api/paas/v4
UPSTASH_REDIS_REST_URL=your_redis_url
UPSTASH_REDIS_REST_TOKEN=your_redis_token
```

### Redis Cleanup

Set up a cron job to run the cleanup script daily:

```bash
# Add to crontab (crontab -e)
0 2 * * * cd /path/to/project && npx ts-node src/scripts/redis-cleanup.ts
```

Or run manually:

```bash
npx ts-node src/scripts/redis-cleanup.ts
```

### API Changes

- All API requests now accept optional `sessionId` parameter
- Rate limit headers included in API responses (`X-RateLimit-*`)
- Health check available at `GET /api/health`

## Testing

Run the new ExecutionEngine tests:

```bash
npm test -- src/lib/__tests__/execution-engine.test.ts
```

Run all tests:

```bash
npm test
```

## Security Considerations

1. **CORS**: Update `ALLOWED_ORIGINS` in production to your actual domain(s)
2. **Rate Limiting**: Currently set to 100 requests/hour/IP. Adjust in `src/middleware.ts` if needed
3. **Input Sanitization**: All user inputs are now sanitized to prevent XSS
4. **Session Isolation**: Different users now get independent cache entries

## Performance Metrics

- **Bundle Size**: Use `ANALYZE=true npm run build` to analyze
- **Cache Hit Rate**: Should maintain >80% for repeated queries within session
- **Execution Time**: Now logged per-step and total chain duration
