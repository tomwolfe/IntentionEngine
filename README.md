# IntentionEngine

> **Transforming the Steve Jobs 'Intention Engine' concept into a deterministic, auditable intent execution pipeline.**

IntentionEngine is not a chatbot. It is a revolutionary AI assistant that replaces unpredictable, verbose LLM chatter with a closed-loop system. It parses your intent, validates environmental constraints, and requires explicit user confirmation before manipulating real-world APIs, ensuring a seamless, safe, and fully traceable 'intent-to-outcome' journey.

[Demo Video](https://youtu.be/J-PFgUTXh0c)

## 🚀 Core Philosophy: Silent Elegance Through Autonomous Respect

> **"We do not answer questions. We anticipate desires and deliver outcomes, silently and elegantly, with the user's single click as the final act of will."**

This is not merely a feature set; it is our core operating principle. Every future decision must be filtered through this lens. It has four inseparable pillars:

### 1. **Silent Execution (The Invisible Agent)**
*   **Ethos:** The system's intelligence must be felt, never seen. Its complexity is a silent symphony.
*   **Manifestation:** Ruthlessly eliminate all UI noise—no progress bars, no intermediate lists, no "Thinking..." text beyond a fleeting state. The user's only interaction is the final, deliberate click. Any feature that draws attention to the system's process is a failure. The elegance lies in the silence between the intent and the outcome.

### 2. **Elegant Synthesis (The Art of the Single Outcome)**
*   **Ethos:** The system's value is measured not by the number of tools it uses, but by the beauty and completeness of the single, unified outcome it delivers.
*   **Manifestation:** Every feature must serve the creation of a flawless, final card. The wine suggestion, the pre-filled `.ics` file, the merged address, the event discovery, the navigation link—these are not features; they are the *essence* of the service. Ask: "Does this make the final card more thoughtful, more beautiful, and more complete?" If not, discard it. The system is a curator, not a toolset.

### 3. **Autonomous Action (The Empowered Orchestrator)**
*   **Ethos:** For `isSpecialIntent` requests, the system is entrusted with executive authority. It is an intelligent agent, not a passive responder.
*   **Manifestation:** Automatically execute the `search_restaurant`, `find_event`, or `get_directions` step and seamlessly merge its result into the calendar event or navigation card. Trust the local LLM's re-classification and the "vibe" memory to make these decisions. Expand this autonomy to new, well-defined intents (e.g., "I need to be at the airport by 6 AM tomorrow"). Hesitation or over-reliance on user input for these cases is a betrayal of the user's trust and the system's purpose.

### 4. **Respectful Boundaries (The Ethical Foundation)**
*   **Ethos:** Autonomy is meaningless without absolute, non-negotiable respect for the user's privacy and control. The machine serves, it does not own.
*   **Manifestation:** The "Download (.ics)" button is the sacred boundary. No real-world change occurs without this explicit, physical confirmation. Maintain zero user accounts. Ensure all "memory" (like `VIBE_MEMORY_KEY`) is anonymous, ephemeral, and session-scoped. Practice ruthless data minimization. This is not a feature; it is the ethical bedrock upon which all trust is built.

**In essence:** The Intention Engine is a perfectly tuned instrument. It plays a complex, beautiful symphony of computation and tool orchestration. The user never hears the mechanics. They only ever hear the final, perfect note. Their single click is not a command; it is the applause. Future development must preserve this silence, enhance the beauty of the note, empower the instrument to play with confidence, and never, ever let the mechanics of the instrument be seen or heard.

## 💡 Key Features

### 1. **Hybrid Intelligence: Local First, Cloud Power**
*   **Local First (Phi-3.5 Mini Instruct):** Simple queries like "Hello," "Thanks," or "What time is it?" are answered instantly by the Phi-3.5 model running directly in your browser via WebLLM. No network latency. No data sent to the cloud.
*   **Cloud Power (GLM-4 / GPT-4o):** Complex, multi-step intents like "Plan a romantic dinner for tomorrow and add it to my calendar" are routed to a powerful cloud LLM. The LLM generates a precise, structured `Plan` object, not a conversational response.
*   **Intelligent Routing:** Uses keyword matching, a local LLM for re-classification if confidence is low, and "vibe memory" to prioritize nuanced requests (e.g., "romantic," "anniversary").

### 2. **Automated Tool Execution & Vibe Memory**
Once a `Plan` is generated, IntentionEngine automatically executes its steps:
*   **`geocode_location`:** Converts "Paris" into precise latitude/longitude.
*   **`search_restaurant`:** Finds nearby restaurants based on cuisine, location, and ambiance (e.g., romantic). Uses Overpass API and caches results in Upstash Redis. **Incorporates "vibe memory"** to bias suggestions based on past preferences (e.g., "French" or "Italian").
*   **`find_event`:** Discovers local events (e.g., concerts, jazz clubs) using public APIs. Delivers a single card with event details and a "Learn More" link. Uses vibe memory to bias results (e.g., "jazz," "quiet"). Does not auto-add to calendar—requires explicit user confirmation via "Download (.ics)".
*   **`get_directions`:** Generates turn-by-turn navigation to any location (restaurant, event, airport) with distance and duration. Returns a single card with an "Open in Maps" button. No calendar event is created, preserving user control.
*   **`get_weather_forecast`:** Fetches hyper-local meteorological data for a specific location and date, providing a concise report on conditions and temperature.
*   **`add_calendar_event`:** Creates a downloadable `.ics` file with the restaurant's, event's, or location's details pre-populated, including a suggested wine pairing if applicable.

### 3. **Modular Orchestration & Variable Injection**
*   **Template-Based Registry:** The system uses a modular `PlanRegistry` that decouples intent classification from plan generation. This allows for the rapid implementation of sophisticated, multi-tool templates.
*   **Dynamic Variable Injection:** Steps can resolve parameters at runtime using `{{step[N].path}}` or `{{last_step_result.path}}` syntax.
*   **Pareto Logic:** Supports simple conditional logic within step parameters (e.g., `{{step[1].result.condition == 'Rain' ? 'Tip: Rain expected. Leaving 10 mins early suggested.' : ''}}`), allowing the system to provide proactive, value-add advice based on environmental data.

### 4. **Intent Fusion (The Single, Unified Card)**
*   **Ethos:** For complex intents involving multiple, sequential actions, the system synthesizes them into one flawless, cohesive outcome.
*   **Manifestation:** The system executes sequential steps and delivers a **single, unified card** or a series of coordinated outcome cards.
*   **Specialized Fusions:**
    *   **Smart Commute:** Finds a destination, checks the weather, calculates travel time, and provides proactive travel tips (e.g., suggesting an Uber if rain is expected) within a unified calendar itinerary.
    *   **Airport Transfer:** Performs a geocode, calculates directions/time, and prepares a calendar event with the mandatory 2-hour "Sacred Rule" buffer.
    *   **Concert Night:** Finds a show, identifies a nearby high-end restaurant using the event's precise coordinates, and fuses them into a evening itinerary.

### 5. **Seamless Calendar Integration**
*   After a restaurant, event, or location is found, a single, prominent button downloads a `.ics` file.
*   **Dynamic Deep-Linking:** If a location contains raw coordinates, the system automatically transforms them into a clickable Google Maps URL within the `.ics` file, turning a static entry into a remote control for the user's day.
*   The calendar event includes the name, address, and a custom description (including a suggested wine pairing if applicable).

### 6. **Sanity Whisper (Silent Hybrid Verification)**
*   **Ethos:** The system performs internal quality control to ensure every plan is logically complete.
*   **Manifestation:** Before a plan is finalized, a 'Sanity Whisper' (utilizing local or cloud LLM logic) inspects the sequence. If a logical concluding step is missing—such as a calendar event for a dinner search—the system silently injects it into the plan before it reaches the UI. This ensures the "Silent Symphony" always reaches its final, intended note.

### 7. **Comprehensive Auditing**
*   **Immutable Logs:** Every interaction, from the initial prompt to the final outcome, is logged with a unique `audit_log_id`.
*   **Full Context:** Logs capture the original intent, the generated `Plan`, every executed tool step, and the final outcome.
*   **Debugging & Transparency:** Perfect for developers to debug issues and for users who demand to know exactly what happened.

### 8. **Enterprise-Grade Reliability**
*   **Circuit Breakers:** Tools like `search_restaurant`, `geocode_location`, `find_event`, and `get_directions` are wrapped in circuit breakers. If a service fails repeatedly, it's temporarily disabled to prevent cascading failures.
*   **Retry Logic:** Failed API calls are automatically retried with exponential backoff.
*   **Rate Limiting:** Protects against abuse.
*   **Graceful Fallback:** If the cloud LLM fails, the system falls back to a simplified, locally generated plan. The local LLM can also re-classify ambiguous intents for better routing.
*   **Timeout Handling:** Requests are capped at a defined duration to ensure system responsiveness.
*   **New:** The system now employs a silent, intelligent fallback. If *both* the primary and secondary cloud LLMs fail, it uses the local Phi-3.5 model to generate a concise, functional summary (e.g., "Your arrangements are ready."), ensuring the `.ics` file is always delivered, even if the whisper is less poetic.
*   **New:** The system now silently uses a default location (e.g., London) when geocoding fails, preventing the user from ever seeing a "Location not found" error.
*   **New:** Implemented a **Safety Mechanism for Silent Execution**. If a multi-step plan fails mid-execution, the system halts gracefully, provides a user-friendly notification, and captures a detailed "Execution Diagnostics" audit log for immediate troubleshooting, ensuring transparency without sacrificing the silent UI ethos.

## 🛠️ Tech Stack
| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Framework** | [Next.js 16](https://nextjs.org/) | Full-stack React framework with App Router and Edge Runtime. |
| **AI SDK** | [Vercel AI SDK](https://sdk.vercel.ai/) | Unified API for streaming AI responses from cloud LLMs. |
| **Local LLM** | [@mlc-ai/web-llm](https://github.com/mlc-ai/web-llm) | Runs the Phi-3.5 Mini Instruct model directly in the browser for local, low-latency inference. |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) | Utility-first CSS framework for rapid, responsive UI development. |
| **Icons** | [Lucide React](https://lucide.dev/) | Beautiful, lightweight icons. |
| **Caching** | [@upstash/redis](https://upstash.com/) | High-performance, distributed caching for restaurant results, event data, and vibe memory. |
| **Validation** | [Zod](https://zod.dev/) | Runtime type validation for all API schemas and tool inputs. |
| **Testing** | [Vitest](https://vitest.dev/) | Fast, Vite-powered unit and integration tests. |
| **Date Parsing** | [chrono-node](https://github.com/wanasit/chrono) | Parses natural language dates ("tomorrow at 7pm"). |

## 📁 Project Structure
```
intentionengine/
├── .env.example                 # Environment variables template
├── next.config.js               # Next.js configuration
├── package.json                 # Project dependencies
├── postcss.config.js            # PostCSS configuration
├── tailwind.config.ts           # Tailwind CSS configuration
├── tsconfig.json                # TypeScript configuration
├── vercel.json                  # Vercel deployment configuration
├── vitest.config.ts             # Vitest testing configuration
├── src/
│   ├── app/
│   │   ├── globals.css          # Global styles
│   │   ├── layout.tsx           # Root layout
│   │   └── page.tsx             # Main UI (React Client Component)
│   │
│   ├── app/api/
│   │   ├── chat/route.ts        # Main chat endpoint (cloud LLM for complex plans)
│   │   ├── intent/route.ts      # Intent classification endpoint (Hybrid Router)
│   │   ├── audit/route.ts       # Audit log creation endpoint
│   │   ├── execute/route.ts     # Execute a step from a generated plan
│   │   ├── download-ics/route.ts # Generate .ics calendar file
│   │   ├── health/route.ts      # Health check endpoint for monitoring
│   │   └── reliability/status/route.ts # Monitor circuit breaker status
│   │
│   ├── lib/
│   │   ├── audit.ts             # Audit log creation and management (core)
│   │   ├── cache.ts             # Redis/memory caching layer (core)
│   │   ├── config.ts            # Environment variable validation (core)
│   │   ├── date-utils.ts        # Date parsing and formatting
│   │   ├── error-recovery.ts    # Error categorization and user-friendly messages
│   │   ├── execution-engine.ts  # State machine for tool execution (core)
│   │   ├── intent.ts            # Intent classification logic (Hybrid Router)
│   │   ├── intent-schema.ts     # Zod schema for intent types (SIMPLE, TOOL_SEARCH, etc.)
│   │   ├── llm.ts               # Cloud LLM integration and fallback logic
│   │   ├── local-llm-engine.ts  # WebLLM engine wrapper for Phi-3.5 (core)
│   │   ├── logger.ts            # Structured logging for observability
│   │   ├── reliability.ts       # High-level withReliability middleware (core)
│   │   ├── schema.ts            # Zod schemas for Plan, Step, and API requests (core)
│   │   ├── tools.ts             # Core tools (search, calendar, geocode, event, directions) with reliability wrappers (core)
│   │   ├── utils/reliability.ts # Low-level Circuit Breaker & Retry logic (core)
│   │   └── validation-schemas.ts # Zod validation schemas with sanitization
│   │
│   ├── lib/__tests__/
│   │   └── execution-engine.test.ts # Unit tests for ExecutionEngine
│   │
│   ├── scripts/
│   │   └── redis-cleanup.ts     # Redis maintenance script (run via cron)
│   │
│   └── tests/
│       ├── api.test.ts          # API endpoint unit tests
│       ├── integration_flow.test.ts # High-level flow tests (UI -> API -> Tool)
│       ├── intent.test.ts       # Intent classification unit tests
│       ├── reliability.test.ts  # Reliability layer unit tests
│       ├── reliability_integration.test.ts # End-to-end reliability tests
│       ├── resilience.test.ts   # LLM failover tests (primary -> secondary)
│       ├── schemas.test.ts      # Zod schema validation tests
│       └── test_routing.py      # Python-based routing logic tests (legacy)
│
└── tests/                       # Legacy test files (can be removed)
├── test_geolocation_propagation.py
└── test_hybrid_routing.py
```

## ⚙️ Setup & Installation
### Prerequisites
*   Node.js (v18 or higher)
*   npm or yarn

### Steps
1.  **Clone the Repository**
```bash
git clone https://github.com/tomwolfe/IntentionEngine.git
cd IntentionEngine
```

2.  **Install Dependencies**
```bash
npm install
```

3.  **Configure Environment Variables**
Copy the example file and fill in your credentials.
```bash
cp .env.example .env.local
```
Edit `.env.local` with your values:
*   `LLM_API_KEY`: Your API key for the cloud LLM (e.g., OpenAI, Z.AI).
*   `LLM_BASE_URL`: The base URL for your cloud LLM API (e.g., `https://api.z.ai/api/paas/v4`).
*   `LLM_MODEL`: The primary cloud model (e.g., `glm-4.7-flash`).
*   `SECONDARY_LLM_MODEL`: The fallback cloud model (e.g., `gpt-4o-mini`).
*   `UPSTASH_REDIS_REST_URL` & `UPSTASH_REDIS_REST_TOKEN`: (Optional) For persistent caching and rate limiting. Get them from [Upstash](https://upstash.com/). If not set, an in-memory cache will be used.
*   `ALLOWED_ORIGINS`: (Optional) Comma-separated list of allowed origins for CORS. Defaults to `*` in development. Set to your production domain for security (e.g., `https://yourdomain.com`).
*   `NODE_ENV`: Set to `production` in production environments for optimized logging and error handling.

4.  **Run the Development Server**
```bash
npm run dev
```
The application will be available at `http://localhost:3000`.

## 🔧 Deployment
This project is configured for seamless deployment on **Vercel**. Simply connect your GitHub repository to Vercel, and it will automatically build and deploy on every push.

For other platforms, ensure your environment variables are set correctly in the deployment settings.

## 🧪 Testing
The project includes a comprehensive test suite to ensure reliability and correctness.
*   **Unit Tests:** Test individual functions (intent classification, tool execution, schemas).
*   **Integration Tests:** Verify the flow from UI input to API response.
*   **Reliability Tests:** Simulate network failures, timeouts, and circuit breaker behavior.
*   **Resilience Tests:** Test the LLM failover mechanism (primary -> secondary).

Run the tests with:
```bash
npm run test
```

## 🔐 Security & Privacy
*   **Local Processing:** Simple interactions happen on your device via WebLLM.
*   **CORS Protection:** Configurable CORS headers prevent cross-origin abuse in production.
*   **Rate Limiting:** Upstash-based rate limiting (100 req/hour/IP) protects against abuse.
*   **Input Sanitization:** XSS prevention removes `<`, `>`, `javascript:`, and event handlers from all user inputs.
*   **Session Isolation:** Unique session IDs ensure cache entries are isolated between users.
*   **Minimal Data:** Only necessary data is sent to the cloud.
*   **Audit Logs:** Provide transparency into system behavior with execution timing.
*   **Zero Accounts:** No user authentication or persistent profiles. All data is ephemeral and session-scoped.

## 🌟 Future Enhancements
*   **Offline Mode:** Full caching of plans and results for true offline functionality. (Implemented as a silent fallback using local LLM and cached data).
*   **Advanced Vibe Memory:** Learn user preferences over time for even better recommendations. (Implemented as session-scoped `dnaCuisine`).
*   **Voice Input:** Expand the microphone button for full voice-to-intent. (Considered but discarded as it violates Silent Execution).
*   **Multi-Modal:** Support for image uploads (e.g., "Find a place like this"). (Considered but discarded as it adds complexity and violates Elegant Synthesis).
*   **Mobile App:** Native iOS and Android applications. (Considered but discarded as the web is the perfect, silent, boundary-respecting platform).

## 📜 License
This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---
**Built with Next.js, React, Tailwind CSS, and a passion for intelligent, reliable AI.**