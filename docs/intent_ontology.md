# Intent Ontology

## DEFINITION OF INTENT

**Intent** is a structured, validated, versioned object representing a user's explicit goal within a bounded domain. It is NOT a chatbot response, NOT a raw text input, and NOT an implicit interpretation.

### Core Principles

1. **Intent is Explicit** - All user goals must be expressed through verifiable parameters
2. **Intent is Bound** - Only valid within specified temporal, spatial, and permission constraints
3. **Intent is Versioned** - Each interpretation has immutable metadata and version history
4. **Intent is Inspectable** - All reasoning, normalization, and confidence scoring is traceable

## INTENT STRUCTURE

### Required Fields (MUST BE PRESENT)

```typescript
{
  id: string;              // UUID v4 - unique identifier
  version: number;         // Sequential version number
  type: IntentType;        // One of: SCHEDULE | SEARCH | ACTION | QUERY | PLANNING | UNKNOWN | clarification_needed

  // User goals (EXPLICIT)
  primaryGoal: string;     // Human-readable description
  explicitConstraints: Array<{
    type: string;          // CONSTRAINT_TYPE enum
    value: any;
    validatedBy: string;   // Schema, rule, or external service name
    proven: boolean;       // Explicitly validated or assumed
  }>;

  // User preferences (OPTIONAL but documented)
  preferences: {
    priority?: "high" | "medium" | "low";
    urgency?: number;      // 1-10 scale
    acceptableAlternatives: boolean;  // Whether alternative interpretations are acceptable
  };

  // Ambiguity tracking (MANDATORY for low confidence)
  ambiguities: Array<{
    originalText: string;
    hypotheses: string[];  // Multiple possible interpretations
    resolved: boolean;     // Whether clarified by user or auto-resolved
    resolution?: string;   // If resolved, what happened
  }>;

  // Rejected interpretations (MANDATORY - proves we considered alternatives)
  rejectedInterpretations: Array<{
    candidate: string;
    rejectionReason: string;
    confidenceScore: number;  // Why this was rejected
  }>;

  // Non-LLM confidence score
  confidence: {
    score: number;         // 0.0 - 1.0 (NOT from LLM)
    method: string;        // How score was calculated
    weightings: { [key: string]: number };  // What contributed to score
  };

  // Temporal validity
  temporal: {
    createdAt: string;     // ISO 8601
    expiresAt: string;     // ISO 8601 (optional)
    validityDuration?: number;  // Seconds from creation
  };

  // Traceability
  trace: {
    inputSource: string;   // User input, API call, etc.
    rawText: string;       // Original input
    context: {
      sessionId?: string;
      userContext?: any;
      environment?: string;
    };
    generationMetadata: {
      pipelineVersion: string;
      llmProvider: string;
      llmModel: string;
      promptTemplate: string;
    };
  };
}
```

### Supported Intent Types

```typescript
enum IntentType {
  SCHEDULE = "SCHEDULE",
  SEARCH = "SEARCH",
  ACTION = "ACTION",
  QUERY = "QUERY",
  PLANNING = "PLANNING",
  UNKNOWN = "UNKNOWN",
  clarification_needed = "clarification_needed"
}
```

### Constraint Types

```typescript
enum CONSTRAINT_TYPE {
  TEMPORAL = "TEMPORAL",
  SPATIAL = "SPATIAL",
  RESOURCE = "RESOURCE",
  PERMISSION = "PERMISSION",
  BUSINESS_RULE = "BUSINESS_RULE"
}
```

## EXCLUSIONS

### What Intent is NOT

1. **NOT Chatbot Output** - Intent is not a conversational response
2. **NOT Partial Interpretation** - Must be complete or explicitly marked as incomplete
3. **NOT Abstract Concept** - Must map to verifiable parameters
4. **NOT Implicit Goal** - User must explicitly state the goal

### Explicitly Excluded Categories

- Purely conversational text without actionable content
- Greeting or farewells without intent
- Sentiment analysis without behavioral goal
- Language generation tasks (e.g., "write a poem" without specified constraints)
- Creative writing without defined parameters

## AMBIGUITY DEFINITION

Ambiguity is NOT acceptable without explicit handling.

An input produces a **clarification_needed** intent when:

1. Multiple valid hypotheses exist with different behavioral consequences
2. Confidence score < 0.7
3. Resolution requires user clarification

Ambiguity must be:
- Documented in `ambiguities` field
- Presented as multiple hypotheses in `rejectedInterpretations`
- Resolved before execution

## VALIDATION PRINCIPLES

### Proof-Based Validation

Every field in Intent must be:
1. **Explicitly stated** by user (unless proven by context)
2. **Proven** by schema validation or external service
3. **Documented** with evidence reference

### Rejection of Assumptions

If a value cannot be proven:
1. It must be absent (null/undefined)
2. It must be marked as "unproven" in constraints
3. Execution must be denied or clarification requested

## EXAMPLES

### Valid Intent

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "version": 1,
  "type": "SCHEDULE",
  "primaryGoal": "Schedule a meeting with John Doe at 2pm tomorrow",
  "explicitConstraints": [
    {
      "type": "TEMPORAL",
      "value": "2026-02-11T14:00:00Z",
      "validatedBy": "ISO8601_Parser",
      "proven": true
    },
    {
      "type": "BUSINESS_RULE",
      "value": "office_hours_only",
      "validatedBy": "Calendar_Rules",
      "proven": true
    }
  ],
  "preferences": {
    "priority": "high",
    "urgency": 8,
    "acceptableAlternatives": false
  },
  "ambiguities": [],
  "rejectedInterpretations": [],
  "confidence": {
    "score": 0.92,
    "method": "keyword_match + temporal_parser",
    "weightings": {
      "keyword_match": 0.5,
      "temporal_parser": 0.4,
      "domain_heuristics": 0.1
    }
  },
  "temporal": {
    "createdAt": "2026-02-10T14:30:00Z",
    "expiresAt": "2026-02-10T15:00:00Z",
    "validityDuration": 1800
  },
  "trace": {
    "inputSource": "web_api",
    "rawText": "Schedule a meeting with John Doe at 2pm tomorrow",
    "context": {
      "sessionId": "sess_12345",
      "userContext": { "user_id": "user_67890", "timezone": "UTC" },
      "environment": "production"
    },
    "generationMetadata": {
      "pipelineVersion": "v1.0.0",
      "llmProvider": "openai",
      "llmModel": "gpt-4",
      "promptTemplate": "intent_inference_v1"
    }
  }
}
```

### Ambiguous Intent (Must Be Clarification)

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "version": 1,
  "type": "clarification_needed",
  "primaryGoal": null,
  "explicitConstraints": [],
  "preferences": {},
  "ambiguities": [
    {
      "originalText": "Send John an email",
      "hypotheses": [
        "Create a calendar event with John",
        "Compose an email to John",
        "Send a message via chat platform"
      ],
      "resolved": false,
      "resolution": null
    }
  ],
  "rejectedInterpretations": [
    {
      "candidate": "Create a calendar event",
      "rejectionReason": "Keyword 'email' suggests communication rather than scheduling",
      "confidenceScore": 0.6
    },
    {
      "candidate": "Compose an email",
      "rejectionReason": "Ambiguous intent - not confirmed by user",
      "confidenceScore": 0.7
    },
    {
      "candidate": "Send a message via chat",
      "rejectionReason": "Insufficient information",
      "confidenceScore": 0.5
    }
  ],
  "confidence": {
    "score": 0.45,
    "method": "LLM_hypothesis_generation",
    "weightings": {
      "LLM_confidence": 0.6,
      "intent_coverage": 0.4
    }
  },
  "temporal": {
    "createdAt": "2026-02-10T14:35:00Z",
    "expiresAt": "2026-02-10T15:05:00Z",
    "validityDuration": 1800
  },
  "trace": {
    "inputSource": "web_api",
    "rawText": "Send John an email",
    "context": {
      "sessionId": "sess_12345",
      "userContext": { "user_id": "user_67890" },
      "environment": "production"
    },
    "generationMetadata": {
      "pipelineVersion": "v1.0.0",
      "llmProvider": "openai",
      "llmModel": "gpt-4",
      "promptTemplate": "intent_inference_v1"
    }
  }
}
```

### Invalid Intent (Should Be Rejected)

```json
// INVALID: Missing explicit constraints
{
  "id": "550e8400-e29b-41d4-a716-446655440002",
  "version": 1,
  "type": "SCHEDULE",
  "primaryGoal": "Meeting",
  "explicitConstraints": [],  // MISSING
  "preferences": {},
  "ambiguities": [],
  "rejectedInterpretations": [],
  "confidence": {
    "score": 0.95,
    "method": "placeholder",
    "weightings": {}
  },
  "temporal": {
    "createdAt": "2026-02-10T14:40:00Z",
    "expiresAt": "2026-02-10T15:10:00Z",
    "validityDuration": 1800
  },
  "trace": {
    "inputSource": "web_api",
    "rawText": "Meeting",
    "context": {
      "sessionId": "sess_12345",
      "userContext": { "user_id": "user_67890" },
      "environment": "production"
    },
    "generationMetadata": {
      "pipelineVersion": "v1.0.0",
      "llmProvider": "openai",
      "llmModel": "gpt-4",
      "promptTemplate": "intent_inference_v1"
    }
  }
}
```

## VALIDATION CHECKLIST

Every Intent must pass these checks:

- [ ] All required fields present
- [ ] All constraints are proven (proven: true)
- [ ] No fields with assumed values (proven: false or missing)
- [ ] Ambiguities documented if present
- [ ] Rejected interpretations present when ambiguities exist
- [ ] Confidence score < 1.0 and method documented
- [ ] Trace metadata complete
- [ ] Type is valid enum value

## KILL CRITERIA (See Kill Criteria Document)

## VERSIONING STRATEGY

- Initial version = 1
- Increment on meaningful changes to interpretation
- Each version maintains immutable history
- Downgrade not allowed (only creation and upgrade)
