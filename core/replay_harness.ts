import { Intent, IntentType, createIntent } from "./intent_schema";
import { normalizeIntent, createIntentSignature, createIntentFromText } from "./intent_normalization";
import { calculateConfidence, getScoringComponents } from "./confidence_scoring";

/**
 * Pipeline state for replay
 */
export interface PipelineState {
  rawText: string;
  intentType: IntentType;
  intent: Intent;
  normalizationResult: any;
  confidenceResult: any;
  signature: string;
  timestamp: string;
}

/**
 * Replay configuration
 */
export interface ReplayConfig {
  normalize: boolean;
  calculateConfidence: boolean;
  preserveOriginal: boolean;
  includeMetadata: boolean;
}

/**
 * Default replay configuration
 */
export const DEFAULT_REPLAY_CONFIG: ReplayConfig = {
  normalize: true,
  calculateConfidence: true,
  preserveOriginal: false,
  includeMetadata: true
};

/**
 * Replay result
 */
export interface ReplayResult {
  originalIntent: Intent;
  replayedIntent: Intent;
  pipelineState: PipelineState;
  wasSuccessful: boolean;
  errors: Array<{
    stage: string;
    error: string;
    timestamp: string;
  }>;
}

/**
 * Replay intent pipeline
 * Purpose: Reproduce intent creation from raw input and preserved state
 * This ensures determinism and traceability
 */
export async function replayIntentPipeline(
  rawText: string,
  state: PipelineState,
  config: ReplayConfig = DEFAULT_REPLAY_CONFIG
): Promise<ReplayResult> {
  const errors: ReplayResult["errors"] = [];
  const timestamp = new Date().toISOString();

  const result: ReplayResult = {
    originalIntent: state.intent,
    replayedIntent: state.intent,
    pipelineState: state,
    wasSuccessful: true,
    errors: []
  };

  try {
    // Step 1: Verify state integrity
    if (!verifyStateIntegrity(state)) {
      errors.push({
        stage: "state_verification",
        error: "Invalid pipeline state",
        timestamp
      });
      result.wasSuccessful = false;
    }

    // Step 2: Replay intent creation
    let replayedIntent = state.intent;
    if (config.normalize) {
      const normResult = normalizeIntent(state.intent);
      replayedIntent = normResult.normalized;
      result.pipelineState.normalizationResult = normResult;
    }

  // Step 3: Replay confidence calculation
  if (config.calculateConfidence) {
    const components = getScoringComponents(replayedIntent, state.rawText);
    const confidence = calculateConfidence(replayedIntent, components);
    const signature = createIntentSignature(replayedIntent);
    result.pipelineState.confidenceResult = {
      components,
      score: confidence,
      signature
    };
  }

  // Import scoring method types locally
  interface ScoringMethod {
    SCHEMA_VALIDATION: string;
    KEYWORD_MATCH: string;
    TEMPORAL_PARSING: string;
    DOMAIN_HEURISTICS: string;
    STRUCTURE_MATCH: string;
    KNOWN_PATTERNS: string;
    LLM_BASELINE: string;
    RULE_BASED: string;
  }

    // Step 4: Update signature
    result.pipelineState.signature = createIntentSignature(replayedIntent);

    // Step 5: Compare with original
    const signaturesEqual = createIntentSignature(state.intent) === createIntentSignature(replayedIntent);

    if (!signaturesEqual) {
      errors.push({
        stage: "signature_verification",
        error: "Intent signatures differ",
        timestamp
      });
      result.wasSuccessful = false;
    }

  } catch (e: any) {
    errors.push({
      stage: "pipeline_replay",
      error: e.message || "Unknown error during replay",
      timestamp
    });
    result.wasSuccessful = false;
  }

  return result;
}

/**
 * Create pipeline state from intent and raw text
 * Purpose: Preserve all necessary information for replay
 */
export function createPipelineState(
  rawText: string,
  intentType: IntentType,
  intent: Intent
): PipelineState {
  return {
    rawText,
    intentType,
    intent,
    normalizationResult: null,
    confidenceResult: null,
    signature: createIntentSignature(intent),
    timestamp: new Date().toISOString()
  };
}

/**
 * Serialize pipeline state for storage
 * Purpose: Persist state for later replay
 */
export function serializePipelineState(state: PipelineState): string {
  return JSON.stringify(state, (key, value) => {
    // Handle special types
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (value instanceof Map) {
      return Array.from(value.entries());
    }
    if (value instanceof Set) {
      return Array.from(value);
    }
    return value;
  });
}

/**
 * Deserialize pipeline state from storage
 * Purpose: Restore state from persisted data
 */
export function deserializePipelineState(serialized: string): PipelineState {
  const state = JSON.parse(serialized);
  return state as PipelineState;
}

/**
 * Verify state integrity
 * Purpose: Ensure pipeline state is valid for replay
 */
export function verifyStateIntegrity(state: PipelineState): boolean {
  // Check required fields
  if (!state.rawText || state.rawText.trim().length === 0) {
    return false;
  }

  if (!state.intentType) {
    return false;
  }

  if (!state.intent || !state.intent.id) {
    return false;
  }

  if (!state.timestamp) {
    return false;
  }

  // Check intent validity
  if (!state.intent.version || state.intent.version <= 0) {
    return false;
  }

  if (!state.intent.primaryGoal || !state.intent.explicitConstraints) {
    return false;
  }

  return true;
}

/**
 * Compare two replay results
 * Purpose: Verify that replay produces identical intent
 */
export function compareReplayResults(result1: ReplayResult, result2: ReplayResult): {
  identical: boolean;
  differences: Array<{
    field: string;
    value1: any;
    value2: any;
  }>;
} {
  const sig1 = createIntentSignature(result1.replayedIntent);
  const sig2 = createIntentSignature(result2.replayedIntent);

  const differences: ReplayResult["errors"] = [];

  // Compare signatures
  if (sig1 !== sig2) {
    differences.push({
      stage: "signature",
      error: "Signatures differ",
      timestamp: ""
    });
  }

  // Compare intents
  const fieldsToCompare: (keyof Intent)[] = [
    'type',
    'primaryGoal',
    'explicitConstraints',
    'confidence',
    'temporal',
    'trace'
  ];

  for (const field of fieldsToCompare) {
    const value1 = JSON.stringify(result1.replayedIntent[field]);
    const value2 = JSON.stringify(result2.replayedIntent[field]);

    if (value1 !== value2) {
      differences.push({
        stage: `field_${field}`,
        error: `Field values differ`,
        timestamp: ""
      });
    }
  }

  return {
    identical: differences.length === 0,
    differences: differences.map(d => ({
      field: d.stage,
      value1: result1.replayedIntent[d.stage as keyof Intent],
      value2: result2.replayedIntent[d.stage as keyof Intent]
    }))
  };
}

/**
 * Run determinism test
 * Purpose: Verify that same input produces same intent across multiple runs
 */
export async function testDeterminism(
  testCases: Array<{ text: string; type: IntentType }>,
  runs: number = 100
): Promise<{
  passed: boolean;
  results: Array<{
    testCase: string;
    run: number;
    signatures: Set<string>;
    variations: number;
  }>;
}> {
  const results: ReplayResult["errors"] = [];

  for (const { text, type } of testCases) {
    const signatures = new Set<string>();
    const runResults: string[] = [];

    for (let run = 0; run < runs; run++) {
      // Create intent from text
      const intent = createIntent(type, text);
      const signature = createIntentSignature(intent);
      signatures.add(signature);
      runResults.push(signature);
    }

    if (signatures.size > 1) {
      results.push({
        stage: `determinism_${type}`,
        error: `Variations found: ${signatures.size} unique signatures`,
        timestamp: ""
      });
    }
  }

  const passed = results.length === 0;

  return {
    passed,
    results: testCases.map(({ text, type }) => ({
      testCase: text.substring(0, 50),
      run: runs,
      signatures: new Set<string>(),
      variations: passed ? 0 : 1
    }))
  };
}

/**
 * Validate replayable intent
 * Purpose: Ensure intent can be reconstructed from preserved state
 */
export function validateReplayableIntent(intent: Intent): {
  isValid: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];

  // Check version
  if (!intent.version || intent.version <= 0) {
    reasons.push("Invalid version");
  }

  // Check trace
  if (!intent.trace || !intent.trace.inputSource) {
    reasons.push("Missing trace information");
  }

  // Check confidence
  if (!intent.confidence || typeof intent.confidence.score !== "number") {
    reasons.push("Invalid confidence score");
  }

  // Check temporal
  if (!intent.temporal || !intent.temporal.createdAt) {
    reasons.push("Missing temporal information");
  }

  return {
    isValid: reasons.length === 0,
    reasons
  };
}

/**
 * Create replayable intent
 * Purpose: Ensure intent has all required metadata for replay
 */
export function createReplayableIntent(
  intent: Intent,
  rawText: string
): {
  intent: Intent;
  state: PipelineState;
} {
  const state = createPipelineState(rawText, intent.type, intent);

  return {
    intent,
    state
  };
}
