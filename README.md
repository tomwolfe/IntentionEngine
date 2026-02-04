# Intention Engine

Intention Engine is a hybrid local/cloud intelligence platform designed to help users execute complex intents like planning dinners and managing calendars.

## Hybrid Architecture

The application employs a deterministic routing strategy to balance between local performance and cloud intelligence:

### 1. Client-Side Execution (Local Intelligence)
Simple tasks are processed directly in the browser using [Web-LLM](https://webllm.mlc-ai.org/).
- **Models:** SmolLM2-135M (default) or Phi-3.5-mini.
- **Routing Logic:** Messages under 100 characters that do not contain tool-related keywords are handled locally.
- **Benefits:** Zero latency, increased privacy, and reduced API costs for basic interactions.

### 2. Server-Side Execution (Cloud Intelligence)
Complex tasks that require tool integration or deep reasoning are routed to the cloud-based GLM API.
- **Tools:** Restaurant searching (Overpass API), Calendar event generation (.ics), and Geocoding.
- **Audit Logging:** All cloud executions are logged for transparency and debugging.

## Performance Optimizations

### Redis Caching
Restaurant search results are cached using Redis to reduce latency and Overpass API usage.
- **Key Format:** `restaurant:{cuisine}:{lat}:{lon}` (rounded to 3 decimal places).
- **TTL:** 3600 seconds (1 hour).
- **Precision:** Approximately 100-meter accuracy.

## Development

### Prerequisites
- Node.js
- Redis (Upstash)
- GLM API Key (configured in `.env`)

### Commands
- `npm run dev`: Start the development server.
- `npm run test`: Run the unit test suite (Vitest).
- `npm run lint`: Run linting checks.

## Tech Stack
- **Frontend:** Next.js (React 19), Tailwind CSS, Lucide Icons.
- **AI/LLM:** AI SDK (@ai-sdk/react, ai), Web-LLM (@mlc-ai/web-llm).
- **Caching:** @upstash/redis.
- **Geodata:** OpenStreetMap (Nominatim & Overpass API).
