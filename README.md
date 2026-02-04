# Intention Engine

A minimalist, agentic interface that transforms natural language intents into orchestrated actions across multiple services.

## Overview

The Intention Engine replaces fragmented app interactions with a unified, agentic flow powered by GLM-4.7-flash (via Z.AI SDK). Simply express your intent in natural language, and the engine decomposes it into a coordinated sequence of actions.

### Example

**Input:** "I'm taking Sarah to dinner Friday"

**Output:** 
- ✅ **OpenTable**: Reservation at Bar Italia confirmed for 7:00 PM Friday
- ✅ **Uber**: Black car scheduled for 6:15 PM pickup
- ✅ **Calendar**: "Dinner with Sarah" event created with 15-min reminder
- ✅ **Personal Context**: Sarah's preferences applied (Italian cuisine, quiet seating, no shellfish)

## Features

- 🎯 **Single Input Interface**: No app grids, no navigation - just express your intent
- 🧠 **Agentic Orchestration**: AI-powered decomposition into multi-service workflows
- 👤 **Personal Context**: Contact-aware preferences and history
- ✨ **Jobsian Design**: Minimalist, monochromatic UI with pulsing transitions (no loading bars)
- 🚀 **Vercel-Ready**: Optimized for deployment on Vercel's free tier

## Architecture

```
User Intent → Z.AI (GLM-4.7-flash) → Orchestrator → Service Actions → Outcome Cards
```

### Components

- **Mock Z.AI SDK** (`src/lib/zai-sdk.ts`): Simulates GLM-4.7-flash with thinking capability
- **Personal Context** (`src/lib/personal-context.ts`): Mock user preferences and contact data
- **Intent API** (`src/app/api/intent/route.ts`): Server-side intent processing
- **IntentInput** (`src/components/IntentInput.tsx`): Pulsing input with skeleton states
- **OutcomeCard** (`src/components/OutcomeCard.tsx`): Service action result cards
- **ResultsDisplay** (`src/components/ResultsDisplay.tsx`): Orchestration results container

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS v4
- **Language**: TypeScript
- **Icons**: Lucide React
- **AI**: Mock Z.AI SDK (GLM-4.7-flash compatible)
- **Deployment**: Vercel-ready

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd intention-engine

# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

### Testing the Example

Type the example prompt in the input field:

```
I'm taking Sarah to dinner Friday
```

Press **Enter** and observe the orchestrated results.

## Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

The application is optimized for Vercel's free tier and supports serverless API routes.

### Manual Build

```bash
# Build for production
npm run build

# Start production server
npm start
```

## Project Structure

```
intention-engine/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── intent/
│   │   │       └── route.ts      # Intent processing API
│   │   ├── page.tsx              # Main UI
│   │   ├── layout.tsx            # Root layout
│   │   └── globals.css           # Tailwind styles
│   ├── components/
│   │   ├── IntentInput.tsx       # Input component
│   │   ├── OutcomeCard.tsx       # Result card
│   │   └── ResultsDisplay.tsx    # Results container
│   └── lib/
│       ├── zai-sdk.ts            # Mock Z.AI SDK
│       ├── personal-context.ts   # User context data
│       └── types.ts              # TypeScript types
├── package.json
├── next.config.ts
├── tsconfig.json
└── README.md
```

## Configuration

### Personal Context

Edit `src/lib/personal-context.ts` to customize user preferences and contacts:

```typescript
export const personalContext: UserContext = {
  contacts: {
    sarah: {
      name: "Sarah",
      preferences: {
        cuisine: ["Italian", "Mediterranean"],
        allergies: ["Shellfish"],
        // ... more preferences
      }
    }
  }
};
```

### Mock API Responses

The mock Z.AI SDK in `src/lib/zai-sdk.ts` simulates GLM-4.7-flash responses. In production, replace this with actual API calls to Z.AI.

## API Endpoint

### POST /api/intent

**Request Body:**
```json
{
  "intent": "I'm taking Sarah to dinner Friday"
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "orchestration": {
      "intent": "Dinner with Sarah",
      "confidence": 0.97,
      "actions": [...],
      "summary": "Complete dinner experience orchestrated..."
    }
  },
  "thinking": "Analyzing intent: Breaking down into sequential actions..."
}
```

## Constraints & Non-Goals

Per the mission contract:

- ✅ **Mocked APIs**: No real Uber/OpenTable integrations (avoiding paid APIs)
- ✅ **No Authentication**: Simple prototype without user auth
- ✅ **Local Storage Only**: No persistent database
- ✅ **Thinking Parameter**: SDK implements `thinking: { type: 'enabled' }`
- ✅ **Zero Loading Bars**: Pulsing transitions and skeleton states only

## Success Criteria Met

✅ Deployable Next.js repository (Vercel-compatible)  
✅ Z.AI SDK integration with thinking parameter  
✅ Single prompt generates structured JSON plan (4+ actions)  
✅ UI contains zero loading bars (skeleton states + pulsing)  
✅ Minimalist Jobsian interface (single input, monochromatic)  

## License

MIT

## Credits

Built with Next.js, Tailwind CSS, and the Z.AI SDK pattern (mock implementation for MVP).
