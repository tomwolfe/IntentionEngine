# IntentionEngine

A Pareto-optimal intention execution engine. Find restaurants, get wine pairings, and add to calendar — all from a single sentence.

## Overview

IntentionEngine takes a natural language intention like *"Book Italian dinner in San Francisco tomorrow at 7pm"* and executes it end-to-end:

1. **Searches** for restaurants using OpenStreetMap (Overpass API)
2. **Recommends** wine pairings based on cuisine type
3. **Generates** calendar events (.ics files) for immediate download

No chat bubbles. No "thinking..." text. No intermediate confirmations. Just input → outcome.

## Architecture

This is the **80/20 Pareto-optimal** version:

- **~400 lines of code** (was 3,000+)
- **5 source files** (was 30+)
- **No database** — console logging for audit trail
- **No local LLM** — cloud-only (OpenAI)
- **No caching** — direct execution
- **No circuit breakers** — simple error handling

### Tech Stack

- Next.js 16 (App Router)
- Vercel AI SDK 6
- OpenAI GPT-4o-mini
- Tailwind CSS
- TypeScript

### File Structure

```
src/
├── app/
│   ├── page.tsx              # Silent UI (IDLE → THINKING → RESULT)
│   ├── layout.tsx            # Root layout
│   └── api/
│       ├── chat/route.ts     # Vercel AI SDK + tool orchestration
│       └── download-ics/route.ts  # ICS file generator
└── lib/
    └── tools.ts              # Restaurant search, wine pairing, ICS utils
```

## Getting Started

### Prerequisites

- Node.js 20+
- OpenAI API key

### Installation

```bash
npm install
```

### Environment Variables

Create `.env.local`:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Build

```bash
npm run build
```

## Usage

Type an intention in the input field:

```
Book Japanese dinner in Brooklyn Friday at 8pm
Find me a Mexican place in Austin for Saturday lunch
Italian restaurant in Chicago tonight at 7
```

The engine will:
1. Parse your request
2. Search for matching restaurants
3. Generate a wine pairing
4. Create a calendar event
5. Display an outcome card with download button

## Tools

### search_restaurant
Searches OpenStreetMap for restaurants by cuisine and location.

### add_calendar_event
Generates .ics calendar files for download.

### get_wine_pairing
Returns thoughtful wine recommendations (hardcoded logic, zero API calls).

## Wine Pairings

Hardcoded pairings for 15+ cuisines:

- **Italian** → Chianti Classico
- **Japanese** → Dry Sake or Pinot Grigio
- **Mexican** → Albariño or Rosé
- **Indian** → Riesling or Gewürztraminer
- **French** → Burgundy Pinot Noir
- ...and more

## Philosophy

> "The best code is no code." — Old Programmer Proverb

This version strips away:
- ❌ Local LLM inference (@mlc-ai/web-llm)
- ❌ Redis caching
- ❌ Circuit breakers & retry logic
- ❌ Database persistence
- ❌ Chat history
- ❌ Middleware
- ❌ Tests (rely on TypeScript + build checks)

What's left is the **minimal viable product** that delivers user value.

## License

ISC

## Changelog

### v2.0.0 — Pareto Core
- Complete rewrite to 80/20 form
- Reduced from 30 files to 5
- Removed all non-essential dependencies
- Silent UI pattern (no chat bubbles)
- Deterministic tool execution flow

### v1.0.0 — Original
- Full-featured with local LLM, caching, circuit breakers
- Complex reliability layer
- Hybrid routing system
