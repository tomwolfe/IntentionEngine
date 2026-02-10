# IntentionEngine

A simplified, flexible, and capable engine that converts user intent into actionable multi-step plans.

## Architecture

The project has been refactored into a modular, plugin-based system:

- **/src/lib/tools/**: Self-contained tool modules. Adding a new tool is as simple as creating a new file and registering it in `index.ts`.
- **/src/lib/providers/**: Abstraction layer for external APIs (Geocoding, Search).
- **/src/lib/planner.ts** (in `llm.ts`): Generic LLM-based planner that uses tool definitions to build execution plans.
- **/src/lib/executor.ts**: Orchestrates the execution of planned steps.
- **/src/lib/cache.ts**: Multi-layer caching (Redis + In-memory LRU).

## Features

- **Plugin-based Tool System**: Easy to extend.
- **Provider Abstraction**: Switch between Nominatim/Google/etc.
- **Rich Tool Library**:
  - `search_restaurant`: Search for dining options.
  - `add_calendar_event`: Schedule events.
  - `geocode_location`: Place-to-coordinate conversion.
  - `get_weather`: Current weather via OpenWeatherMap.
  - `wikipedia_lookup`: Instant info from Wikipedia.
  - `convert_units`: Unit conversions.
  - `convert_timezone`: Timezone adjustments.
  - `convert_currency`: Real-time exchange rates.
- **Smart Caching**: 24h plan caching and result caching to save API costs.

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `LLM_API_KEY` | GLM-4.7-flash API Key | (Required) |
| `LLM_BASE_URL` | API Endpoint | `https://api.z.ai/api/paas/v4` |
| `GEOCODING_PROVIDER` | `nominatim` | `nominatim` |
| `SEARCH_PROVIDER` | `overpass` | `overpass` |
| `OPENWEATHER_API_KEY` | For weather tool | (Optional) |
| `UPSTASH_REDIS_REST_URL` | Redis URL | (Optional) |
| `UPSTASH_REDIS_REST_TOKEN` | Redis Token | (Optional) |

## Adding a New Tool

1. Create `src/lib/tools/your_tool.ts`.
2. Implement the `Tool` interface.
3. Register it in `src/lib/tools/index.ts`.

Example:
```typescript
export const myTool: Tool<Params> = {
  definition: {
    name: "my_tool",
    description: "Does something cool",
    parameters: z.object({ ... }),
    requires_confirmation: false,
  },
  execute: async (params) => { ... }
};
```

## Migration Guide

- **Tools**: Old `src/lib/tools.ts` is replaced by `src/lib/tools/` directory.
- **Providers**: If you were using custom Overpass logic, it's now in `src/lib/providers/overpass.ts`.
- **API**: The `/api/intent` and `/api/execute` routes now support the new generic tool system.
