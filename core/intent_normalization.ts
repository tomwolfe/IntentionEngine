import { Intent, Constraint, CONSTRAINT_TYPE, IntentType, IntentState, IntentSchema, createIntent } from "./intent_schema";

/**
 * Normalization mode
 */
export enum NormalizationMode {
  STRICT = "STRICT",
  RELAXED = "RELAXED",
  DEBUG = "DEBUG"
}

/**
 * Normalization result
 */
export interface NormalizationResult {
  normalized: Intent;
  original: Intent;
  changes: Array<{
    field: string;
    from: any;
    to: any;
    reason: string;
  }>;
  validated: boolean;
}

/**
 * Normalize an intent to ensure deterministic output
 * Purpose: Ensure identical inputs produce identical intents
 */
export function normalizeIntent(
  intent: Intent,
  mode: NormalizationMode = NormalizationMode.STRICT
): NormalizationResult {
  const changes: NormalizationResult["changes"] = [];
  const normalized: Intent = JSON.parse(JSON.stringify(intent)); // Deep clone

  // 1. Validate type
  if (!isValidIntentType(normalized.type)) {
    changes.push({
      field: "type",
      from: normalized.type,
      to: "UNKNOWN",
      reason: "invalid_intent_type"
    });
    normalized.type = "UNKNOWN";
  }

  // 2. Validate constraints
  normalized.explicitConstraints = normalized.explicitConstraints.map((constraint, index) => {
    const previous = JSON.stringify(constraint);

    if (!isValidConstraintType(constraint.type)) {
      changes.push({
        field: `constraints[${index}].type`,
        from: constraint.type,
        to: null,
        reason: "invalid_constraint_type"
      });
      return {
        ...constraint,
        type: null as any,
        proven: false
      };
    }

    if (constraint.proven === undefined) {
      changes.push({
        field: `constraints[${index}].proven`,
        from: undefined,
        to: false,
        reason: "proven_flag_missing"
      });
      constraint.proven = false;
    }

    const current = JSON.stringify(constraint);
    if (previous !== current) {
      changes.push({
        field: `constraints[${index}]`,
        from: JSON.parse(previous),
        to: JSON.parse(current),
        reason: "constraint_normalization"
      });
    }

    return constraint;
  });

  // 3. Validate preferences
  if (!isValidPreferences(normalized.preferences)) {
    changes.push({
      field: "preferences",
      from: normalized.preferences,
      to: {
        acceptableAlternatives: false
      },
      reason: "invalid_preferences"
    });
    normalized.preferences = {
      acceptableAlternatives: false
    };
  }

  // 4. Validate confidence
  if (!isValidConfidence(normalized.confidence)) {
    changes.push({
      field: "confidence",
      from: normalized.confidence,
      to: {
        score: 0,
        method: "normalization_failure",
        weightings: {}
      },
      reason: "invalid_confidence"
    });
    normalized.confidence = {
      score: 0,
      method: "normalization_failure",
      weightings: {}
    };
  }

  // 5. Normalize timestamps
  if (!normalized.temporal.createdAt) {
    changes.push({
      field: "temporal.createdAt",
      from: null,
      to: new Date().toISOString(),
      reason: "missing_created_at"
    });
    normalized.temporal.createdAt = new Date().toISOString();
  }

  // 6. Ensure temporal validity
  if (!normalized.temporal.expiresAt && normalized.temporal.validityDuration) {
    const expiration = new Date(
      new Date(normalized.temporal.createdAt).getTime() +
      normalized.temporal.validityDuration * 1000
    );
    normalized.temporal.expiresAt = expiration.toISOString();
  }

  // 7. Validate trace
  if (!normalized.trace.inputSource) {
    changes.push({
      field: "trace.inputSource",
      from: null,
      to: "unknown",
      reason: "missing_input_source"
    });
    normalized.trace.inputSource = "unknown";
  }

  // 8. Normalize rejected interpretations
  normalized.rejectedInterpretations = normalized.rejectedInterpretations
    .filter((ri, index) => {
      const valid = isValidRejectedInterpretation(ri, index);
      if (!valid) {
        changes.push({
          field: `rejectedInterpretations[${index}]`,
          from: ri,
          to: null,
          reason: "invalid_rejected_interpretation"
        });
      }
      return valid;
    });

  // Add default rejected interpretation if none exist
  if (normalized.rejectedInterpretations.length === 0) {
    changes.push({
      field: "rejectedInterpretations",
      from: [],
      to: [
        {
          candidate: "default",
          rejectionReason: "validation_failed",
          confidenceScore: 0
        }
      ],
      reason: "missing_rejected_interpretations"
    });
    normalized.rejectedInterpretations = [
      {
        candidate: "default",
        rejectionReason: "validation_failed",
        confidenceScore: 0
      }
    ];
  }

  // Validate after normalization
  const validated = validateIntent(normalized);

  return {
    normalized,
    original: intent,
    changes,
    validated
  };
}

/**
 * Create a deterministic signature for an intent
 * Purpose: Enable replay and comparison of intent objects
 */
export function createIntentSignature(intent: Intent): string {
  const { id, version, type, primaryGoal, temporal } = intent;

  // Remove non-deterministic fields for signature
  const signatureFields = {
    id,
    version,
    type,
    primaryGoal,
    temporal: {
      createdAt: temporal.createdAt,
      expiresAt: temporal.expiresAt
    }
  };

  return JSON.stringify(signatureFields, Object.keys(signatureFields).sort());
}

/**
 * Compare two intents deterministically
 * Purpose: Enable reliable comparison of intent objects
 */
export function compareIntentSignature(
  intent1: Intent,
  intent2: Intent
): number {
  const sig1 = createIntentSignature(intent1);
  const sig2 = createIntentSignature(intent2);

  if (sig1 < sig2) return -1;
  if (sig1 > sig2) return 1;
  return 0;
}

/**
 * Validate intent type
 */
function isValidIntentType(type: string): type is IntentType {
  return ["SCHEDULE", "SEARCH", "ACTION", "QUERY", "PLANNING", "UNKNOWN", "clarification_needed"].includes(type);
}

/**
 * Validate constraint type
 */
function isValidConstraintType(type: string): type is keyof typeof CONSTRAINT_TYPE {
  return Object.values(CONSTRAINT_TYPE).includes(type as any);
}

/**
 * Validate constraints
 */
function isValidConstraints(constraints: Constraint[]): boolean {
  return constraints.length > 0 &&
    constraints.every(c => isValidConstraintType(c.type));
}

/**
 * Validate preferences
 */
function isValidPreferences(preferences: any): boolean {
  if (!preferences) return false;

  if (preferences.priority !== undefined) {
    if (!["high", "medium", "low"].includes(preferences.priority)) {
      return false;
    }
  }

  if (preferences.urgency !== undefined) {
    if (typeof preferences.urgency !== "number" ||
        preferences.urgency < 1 ||
        preferences.urgency > 10) {
      return false;
    }
  }

  return true;
}

/**
 * Validate confidence metadata
 */
function isValidConfidence(confidence: any): boolean {
  if (!confidence || typeof confidence.score !== "number") return false;

  const score = confidence.score;
  if (score < 0 || score > 1) return false;

  if (!confidence.method || typeof confidence.method !== "string") return false;

  if (!confidence.weightings || typeof confidence.weightings !== "object") return false;

  return true;
}

/**
 * Validate rejected interpretation
 */
function isValidRejectedInterpretation(ri: any, index: number): ri is any {
  if (!ri || typeof ri.candidate !== "string") return false;
  if (typeof ri.rejectionReason !== "string") return false;
  if (typeof ri.confidenceScore !== "number") return false;

  // Normalize confidence score
  if (ri.confidenceScore < 0 || ri.confidenceScore > 1) {
    return false;
  }

  return true;
}

/**
 * Validate complete intent
 */
export function validateIntent(intent: Intent): boolean {
  try {
    // Validate schema
    const parsed = IntentSchema.parse(intent);

    // Check required fields
    if (!intent.id || !intent.version || !intent.type) return false;
    if (!intent.primaryGoal || !intent.explicitConstraints.length) return false;
    if (!intent.confidence || !intent.trace) return false;

    // Check temporal validity
    if (!intent.temporal.createdAt) return false;

    // Check rejected interpretations
    if (!intent.rejectedInterpretations.length) return false;

    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Check if intent is expired
 */
export function isIntentExpired(intent: Intent): boolean {
  if (!intent.temporal.expiresAt) return false;

  const now = new Date().getTime();
  const expiresAt = new Date(intent.temporal.expiresAt).getTime();

  return now > expiresAt;
}

/**
 * Check if intent is valid
 */
export function isValidIntent(intent: Intent): boolean {
  return validateIntent(intent) && !isIntentExpired(intent);
}

/**
 * Get intent state based on confidence
 * Purpose: Determine lifecycle state for intent
 */
export function getIntentState(intent: Intent): IntentState {
  if (intent.confidence.score < 0.7) {
    return IntentState.INSUFFICIENT;
  }

  if (intent.type === "UNKNOWN") {
    return IntentState.UNPROCESSED;
  }

  return IntentState.CONFIRMED;
}

/**
 * Create normalized intent from raw text
 * Purpose: Complete deterministic pipeline step
 */
export async function createIntentFromText(
  rawText: string,
  inputSource: string = "unknown"
): Promise<NormalizationResult> {
  // This would normally call LLM, but for determinism we validate the structure
  const baseIntent = createIntent(
    "UNKNOWN",
    rawText,
    {
      trace: {
        inputSource,
        rawText,
        context: {},
        generationMetadata: {
          pipelineVersion: "v1.0.0",
          llmProvider: "test",
          llmModel: "test",
          promptTemplate: "deterministic_test"
        }
      }
    }
  );

  return normalizeIntent(baseIntent);
}
