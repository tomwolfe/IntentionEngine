import { Intent, IntentSchema, IntentType } from "./schema";

/**
 * Normalization Rules based on Intent Ontology.
 * Each type has specific requirements.
 */
const ONTOLOGY_REQUIREMENTS: Record<IntentType, string[]> = {
  SCHEDULE: ["action", "temporal_expression"],
  SEARCH: ["query", "scope"],
  ACTION: ["capability", "arguments"],
  QUERY: ["target_object"],
  PLANNING: ["goal"],
  ANALYSIS: ["context"],
  UNKNOWN: [],
  CLARIFICATION_NEEDED: [],
  REFUSED: []
};

/**
 * Normalizes a candidate intent from an LLM.
 * 1. Validates against Zod schema.
 * 2. Cross-references with Ontology requirements.
 * 3. Adjusts confidence deterministically.
 */
export function normalizeIntent(
  candidate: any,
  rawText: string,
  modelId: string
): Intent {
  // 1. Basic validation
  const parsed = IntentSchema.safeParse({
    ...candidate,
    id: candidate.id || crypto.randomUUID(),
    rawText: rawText,
    metadata: {
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      source: "user_input",
      model_id: modelId,
    }
  });

  if (!parsed.success) {
    // If it doesn't even match the schema, it's UNKNOWN or REFUSED
    return createFallbackIntent(rawText, "UNKNOWN", "Schema validation failed", modelId);
  }

  const intent = parsed.data;

  // 2. Ontology parameter check
  const requirements = ONTOLOGY_REQUIREMENTS[intent.type];
  const missing = requirements.filter(req => !intent.parameters[req]);

  if (missing.length > 0) {
    // Penalty for missing required parameters
    intent.confidence = Math.max(0, intent.confidence - (0.2 * missing.length));
    intent.explanation = `Missing required parameters: ${missing.join(", ")}. ${intent.explanation || ""}`;
    
    // If confidence drops too low, force clarification
    if (intent.confidence < 0.6) {
      intent.type = "CLARIFICATION_NEEDED";
    }
  }

  // 3. Category specific normalization
  if (intent.type === "SCHEDULE") {
     // Ensure action is uppercase
     if (intent.parameters.action) {
       intent.parameters.action = intent.parameters.action.toUpperCase();
     }
  }

  return intent;
}

function createFallbackIntent(
  rawText: string,
  type: IntentType,
  explanation: string,
  modelId: string
): Intent {
  return {
    id: crypto.randomUUID(),
    type,
    confidence: 0,
    parameters: {},
    rawText,
    explanation,
    metadata: {
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      source: "system_fallback",
      model_id: modelId,
    }
  };
}
