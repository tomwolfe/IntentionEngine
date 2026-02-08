# IntentionEngine
> **Transforming the Steve Jobs 'Intention Engine' concept into a deterministic, auditable intent execution pipeline.**

IntentionEngine is not a chatbot. It is a revolutionary AI assistant that replaces unpredictable, verbose LLM chatter with a closed-loop system. It parses your intent, validates environmental constraints, and requires explicit user confirmation before manipulating real-world APIs, ensuring a seamless, safe, and fully traceable 'intent-to-outcome' journey.

[Demo Video](https://youtu.be/J-PFgUTXh0c)

## 🚀 Core Philosophy
IntentionEngine is built on three pillars:
1.  **Hybrid Intelligence:** Use the right tool for the job. A lightweight, local LLM for instant, simple responses. A powerful cloud LLM for complex, multi-step planning.
2.  **Auditable Actions:** Every single user request and system action is logged with a unique `audit_log_id`. No black boxes.
3.  **Reliable Execution:** Built-in circuit breakers, retries, rate limiting, and graceful fallbacks ensure the system works even when APIs fail.

This system ensures your intentions are fulfilled accurately, safely, and transparently.

## 🌟 The Ethos: Silent Elegance Through Autonomous Respect
> **"We do not answer questions. We anticipate desires and deliver outcomes, silently and elegantly, with the user's single click as the final act of will."**

This is not merely a feature set; it is our core operating principle. Every future decision must be filtered through this lens. It has four inseparable pillars:

1.  **Silent Execution (The Invisible Agent):**
    *   **Ethos:** The system's intelligence must be felt, never seen. Its complexity is a silent symphony.
    *   **Manifestation:** Ruthlessly eliminate all UI noise—no progress bars, no intermediate lists, no "Thinking..." text beyond a fleeting state. The user's only interaction is the final, deliberate click. Any feature that draws attention to the system's process is a failure. The elegance lies in the silence between the intent and the outcome.

2.  **Elegant Synthesis (The Art of the Single Outcome):**
    *   **Ethos:** The system's value is measured not by the number of tools it uses, but by the beauty and completeness of the single, unified outcome it delivers.
    *   **Manifestation:** Every feature must serve the creation of a flawless, final card. The wine suggestion, the pre-filled `.ics` file, the merged address—these are not features; they are the *essence* of the service. Ask: "Does this make the final card more thoughtful, more beautiful, and more complete?" If not, discard it. The system is a curator, not a toolset.

3.  **Autonomous Action (The Empowered Orchestrator):**
    *   **Ethos:** For `isSpecialIntent` requests, the system is entrusted with executive authority. It is an intelligent agent, not a passive responder.
    *   **Manifestation:** Automatically execute the `search_restaurant` step and seamlessly merge its result into the calendar event. Trust the local LLM's re-classification and the "vibe" memory to make these decisions. Expand this autonomy to new, well-defined intents (e.g., "I need to be at the airport by 6 AM tomorrow"). Hesitation or over-reliance on user input for these cases is a betrayal of the user's trust and the system's purpose.

4.  **Respectful Boundaries (The Ethical Foundation):**
    *   **Ethos:** Autonomy is meaningless without absolute, non-negotiable respect for the user's privacy and control. The machine serves, it does not own.
    *   **Manifestation:** The "Download (.ics)" button is the sacred boundary. No real-world change occurs without this explicit, physical confirmation. Maintain zero user accounts. Ensure all "memory" (like `VIBE_MEMORY_KEY`) is anonymous, ephemeral, and session-scoped. Practice ruthless data minimization. This is not a feature; it is the ethical bedrock upon which all trust is built.

**In essence:** The Intention Engine is a perfectly tuned instrument. It plays a complex, beautiful symphony of computation and tool orchestration. The user never hears the mechanics. They only ever hear the final, perfect note. Their single click is not a command; it is the applause. Future development must preserve this silence, enhance the beauty of the note, empower the instrument to play with confidence, and never, ever let the mechanics of the instrument be seen or heard.

## 💡 Key Features
### 1. Smart Hybrid Routing
*   **Local First (Phi-3.5 Mini Instruct):** Simple queries like "Hello," "Thanks," or "What time is it?" are answered instantly by the Phi-3.5 model running directly in your browser via WebLLM. No network latency. No data sent to the cloud.
*   **Cloud Power (GLM-4 / GPT-4o):** Complex, multi-step intents like "Plan a romantic dinner for tomorrow and add it to my calendar" are routed to a powerful cloud LLM. The LLM generates a precise, structured `Plan` object, not a conversational response.
*   **Special Intent Detection:** Recognizes nuanced requests (e.g., "romantic," "anniversary") and prioritizes them in planning. Uses a hybrid approach combining keyword matching and a local LLM for re-classification if confidence is low.

### 2. Automated Tool Execution
Once a `Plan` is generated, IntentionEngine automatically executes its steps:
*   **`geocode_location`:** Converts "Paris" into precise latitude/longitude.
*   **`search_restaurant`:** Finds nearby restaurants based on cuisine, location, and ambiance (e.g., romantic). Uses Overpass API and caches results in Upstash Redis. Incorporates "vibe memory" to bias suggestions based on past preferences.
*   **`add_calendar_event`:** Creates a downloadable `.ics` file with the restaurant's details pre-populated.

### 3. Seamless Calendar Integration
*   After a restaurant is found, a single, prominent button downloads a `.ics` file.
*   The calendar event includes the restaurant's name, address, and a custom description (including a suggested wine pairing if applicable).
*   Uses your device's geolocation (with permission) to find places near you.

### 4. Comprehensive Auditing
*   **Immutable Logs:** Every interaction, from the initial prompt to the final outcome, is logged with a unique `audit_log_id`.
*   **Full Context:** Logs capture the original intent, the generated `Plan`, every executed tool step, and the final outcome.
*   **Debugging & Transparency:** Perfect for developers to debug issues and for users who demand to know exactly what happened.

### 5. Enterprise-Grade Reliability
*   **Circuit Breakers:** Tools like `search_restaurant` and `geocode_location` are wrapped in circuit breakers. If a service fails repeatedly, it's temporarily disabled to prevent cascading failures.
*   **Retry Logic:** Failed API calls are automatically retried with exponential backoff.
*   **Rate Limiting:** Protects against abuse.
*   **Graceful Fallback:** If the cloud LLM fails, the system falls back to a simplified, locally generated plan. The local LLM can also re-classify ambiguous intents for better routing.

## 🛠️ Tech Stack
| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Framework** | [Next.js 16](https://nextjs.org/) | Full-stack React framework with App Router and Edge Runtime. |
| **AI SDK** | [Vercel AI SDK](https://sdk.vercel.ai/) | Unified API for streaming AI responses from cloud LLMs. |
| **Local LLM** | [@mlc-ai/web-llm](https://github.com/mlc-ai/web-llm) | Runs the Phi-3.5 Mini Instruct model directly in the browser for local, low-latency inference. |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) | Utility-first CSS framework for rapid, responsive UI development. |
| **Icons** | [Lucide React](https://lucide.dev/) | Beautiful, lightweight icons. |
| **Caching** | [@upstash/redis](https://upstash.com/) | High-performance, distributed caching for restaurant results and vibe memory. |
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
│   │   └── reliability/status/route.ts # Monitor circuit breaker status
│   │
│   ├── lib/
│   │   ├── audit.ts             # Audit log creation and management (core)
│   │   ├── cache.ts             # Redis/memory caching layer (core)
│   │   ├── config.ts            # Environment variable validation (core)
│   │   ├── date-utils.ts        # Date parsing and formatting
│   │   ├── intent.ts            # Intent classification logic (Hybrid Router)
│   │   ├── intent-schema.ts     # Zod schema for intent types (SIMPLE, TOOL_SEARCH, etc.)
│   │   ├── llm.ts               # Cloud LLM integration and fallback logic
│   │   ├── local-llm-engine.ts  # WebLLM engine wrapper for Phi-3.5 (core)
│   │   ├── reliability.ts       # High-level withReliability middleware (core)
│   │   ├── schema.ts            # Zod schemas for Plan, Step, and API requests (core)
│   │   ├── tools.ts             # Core tools (search, calendar, geocode) with reliability wrappers (core)
│   │   └── utils/reliability.ts # Low-level Circuit Breaker & Retry logic (core)
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
*   `UPSTASH_REDIS_REST_URL` & `UPSTASH_REDIS_REST_TOKEN`: (Optional) For persistent caching. Get them from [Upstash](https://upstash.com/). If not set, an in-memory cache will be used.

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
*   **Local Processing:** Simple interactions happen on your device.
*   **Minimal Data:** Only necessary data is sent to the cloud.
*   **Input Sanitization:** All user inputs are rigorously validated and sanitized to prevent injection attacks.
*   **Rate Limiting:** Protects against abuse.
*   **Audit Logs:** Provide transparency into system behavior.
*   **Zero Accounts:** No user authentication or persistent profiles. All data is ephemeral and session-scoped.

## 🌟 Future Enhancements
*   **Voice Input:** Expand the microphone button for full voice-to-intent.
*   **Multi-Modal:** Support for image uploads (e.g., "Find a place like this").
*   **Advanced Vibe Memory:** Learn user preferences over time for even better recommendations.
*   **Offline Mode:** Full caching of plans and results for true offline functionality.
*   **Mobile App:** Native iOS and Android applications.

## 📜 License
This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---
**Built with Next.js, React, Tailwind CSS, and a passion for intelligent, reliable AI.**