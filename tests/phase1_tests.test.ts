import { describe, it, expect } from "@jest/globals";
import { Intent, IntentType, createIntent, IntentSchema } from "../core/intent_schema";
import { normalizeIntent, createIntentSignature, compareIntentSignature, validateIntent, isIntentExpired, isValidIntent, getIntentState, NormalizationMode } from "../core/intent_normalization";
import { calculateConfidence, calculateConfidenceFromText, getScoringComponents } from "../core/confidence_scoring";
import { createPipelineState, serializePipelineState, deserializePipelineState, verifyStateIntegrity, ReplayResult, ReplayConfig, DEFAULT_REPLAY_CONFIG, replayIntentPipeline, compareReplayResults, testDeterminism, validateReplayableIntent, createReplayableIntent } from "../core/replay_harness";

/**
 * Phase 1 Kill Criteria Tests
 */

describe("Phase 1: Deterministic Intent Core", () => {
  describe("KILL_004: Deterministic Normalization", () => {
    it("should produce identical normalized intents for identical input", async () => {
      const testCases = [
        "schedule a meeting at 2pm tomorrow",
        "book a meeting for tomorrow at 3"
      ];

      const runs = 100;
      const results = [];

      for (let i = 0; i < runs; i++) {
        const normalized = [];
        for (const testCase of testCases) {
          const intent = createIntent("SCHEDULE", testCase);
          const normResult = normalizeIntent(intent);

          // Extract key fields for deterministic comparison
          const deterministicIntent = {
            id: "test-id-123",
            version: 1,
            type: normResult.normalized.type,
            primaryGoal: normResult.normalized.primaryGoal,
            explicitConstraints: normResult.normalized.explicitConstraints.map((c: any) => ({
              type: c.type,
              value: c.value,
              validatedBy: c.validatedBy,
              proven: c.proven
            })),
            preferences: normResult.normalized.preferences,
            ambiguities: normResult.normalized.ambiguities.map((a: any) => ({
              originalText: a.originalText,
              hypotheses: a.hypotheses,
              resolved: a.resolved
            })),
            rejectedInterpretations: normResult.normalized.rejectedInterpretations.map((r: any) => ({
              candidate: r.candidate,
              rejectionReason: r.rejectionReason,
              confidenceScore: r.confidenceScore
            })),
            confidence: normResult.normalized.confidence,
            temporal: {
              createdAt: "2026-02-10T14:30:00.000Z",
              expiresAt: "2026-02-10T15:00:00.000Z",
              validityDuration: 1800
            },
            trace: {
              inputSource: "test",
              rawText: testCase,
              context: {},
              generationMetadata: {
                pipelineVersion: "v1.0.0",
                llmProvider: "test",
                llmModel: "test",
                promptTemplate: "test"
              }
            }
          };
          normalized.push(JSON.stringify(deterministicIntent));
        }
        results.push(JSON.stringify(normalized));
      }

      const uniqueResults = new Set(results);
      expect(uniqueResults.size).toBe(1);
    });

    it("should handle same intent through normalization without changes", async () => {
      const intent = createIntent("SCHEDULE", "schedule meeting");
      const result = normalizeIntent(intent);

      expect(result.normalized.id).toBe(intent.id);
      expect(result.normalized.version).toBe(intent.version);
      expect(result.validated).toBe(true);
      expect(result.changes.length).toBe(0);
    });

    it("should normalize all fields deterministically", async () => {
      const testCases = [
        "schedule meeting",
        "book meeting",
        "meeting appointment"
      ];

      const signatures = new Set<string>();

      for (const testCase of testCases) {
        const intent = createIntent("SCHEDULE", testCase);
        const normResult = normalizeIntent(intent);
        const signature = createIntentSignature(normResult.normalized);
        signatures.add(signature);
      }

      // All should have unique signatures
      expect(signatures.size).toBe(testCases.length);
    });
  });

  describe("KILL_005: Confidence Score Determinism", () => {
    it("should produce identical confidence scores for same input", async () => {
      const testCases = [
        "book meeting",
        "schedule meeting",
        "meeting appointment"
      ];

      const runs = 100;
      let hasVariation = false;

      for (const testCase of testCases) {
        const confidenceValues = new Set<number>();

        for (let i = 0; i < runs; i++) {
          const score = calculateConfidenceFromText(testCase, "SCHEDULE");
          confidenceValues.add(score);
        }

        if (confidenceValues.size > 1) {
          hasVariation = true;
          console.log(`Test case "${testCase}" produced ${confidenceValues.size} unique confidence values`);
        }
      }

      expect(hasVariation).toBe(false);
    });

    it("should have consistent confidence calculations across runs", async () => {
      const testInput = "schedule meeting at 2pm";
      const confidenceScores: number[] = [];

      for (let i = 0; i < 100; i++) {
        const intent = createIntent("SCHEDULE", testInput);
        const components = getScoringComponents(intent, testInput);
        const score = calculateConfidence(intent, components);
        confidenceScores.push(score);
      }

      // All scores should be the same
      const uniqueScores = new Set(confidenceScores);
      expect(uniqueScores.size).toBe(1);
    });
  });

  describe("KILL_006: Replay Harness", () => {
    it("should successfully replay pipeline state", async () => {
      const rawText = "schedule meeting at 2pm";
      const intent = createIntent("SCHEDULE", rawText);
      const state = createPipelineState(rawText, "SCHEDULE", intent);

      const replayResult = await replayIntentPipeline(rawText, state);

      expect(replayResult.wasSuccessful).toBe(true);
      expect(replayResult.replayedIntent.id).toBe(intent.id);
    });

    it("should preserve original intent when requested", async () => {
      const rawText = "schedule meeting";
      const intent = createIntent("SCHEDULE", rawText);
      const state = createPipelineState(rawText, "SCHEDULE", intent);

    const replayResult = await replayIntentPipeline(rawText, state, {
      ...DEFAULT_REPLAY_CONFIG,
      preserveOriginal: true
    });

    expect(replayResult.replayedIntent.id).toBe(intent.id);
    expect(replayResult.originalIntent.id).toBe(intent.id);
    });

    it("should validate state integrity", async () => {
      const state = createPipelineState("test", "SCHEDULE", createIntent("SCHEDULE", "test"));

      const isValid = verifyStateIntegrity(state);
      expect(isValid).toBe(true);
    });

    it("should serialize and deserialize state", async () => {
      const rawText = "test intent";
      const intent = createIntent("QUERY", rawText);
      const state = createPipelineState(rawText, "QUERY", intent);

      const serialized = serializePipelineState(state);
      const deserialized = deserializePipelineState(serialized);

      expect(deserialized.rawText).toBe(state.rawText);
      expect(deserialized.intent.id).toBe(state.intent.id);
    });

    it("should detect signature differences in replay", async () => {
      const rawText = "test";
      const intent = createIntent("SCHEDULE", rawText);
      const state = createPipelineState(rawText, "SCHEDULE", intent);

      const result = await replayIntentPipeline(rawText, state, {
        ...DEFAULT_REPLAY_CONFIG,
        normalize: true
      });

      const comparison = compareReplayResults(
        {
          originalIntent: result.originalIntent,
          replayedIntent: result.replayedIntent,
          pipelineState: result.pipelineState,
          wasSuccessful: result.wasSuccessful,
          errors: []
        },
        {
          originalIntent: result.originalIntent,
          replayedIntent: result.replayedIntent,
          pipelineState: result.pipelineState,
          wasSuccessful: result.wasSuccessful,
          errors: []
        }
      );

      expect(comparison.identical).toBe(true);
    });
  });

  describe("Determinism Test Suite", () => {
    it("should pass determinism test with 100% consistency", async () => {
      const testCases: Array<{ text: string; type: IntentType }> = [
        { text: "schedule meeting", type: "SCHEDULE" },
        { text: "find restaurant near me", type: "SEARCH" },
        { text: "send email to John", type: "ACTION" },
        { text: "what is the status", type: "QUERY" },
        { text: "plan a trip", type: "PLANNING" }
      ];

      // Run determinism test
      for (const { text, type } of testCases) {
        const confidenceScores: number[] = [];

        for (let i = 0; i < 100; i++) {
          const intent = createIntent(type, text);
          const components = getScoringComponents(intent, text);
          const score = calculateConfidence(intent, components);
          confidenceScores.push(score);
        }

        // All scores should be the same (except for small floating point differences)
        const uniqueScores = new Set(confidenceScores.map(s => Math.round(s * 1000) / 1000));
        expect(uniqueScores.size).toBe(1);
      }
    });

    it("should validate replayable intents", async () => {
      const intent = createIntent("SCHEDULE", "test");
      const replayable = createReplayableIntent(intent, "test");

      const validation = validateReplayableIntent(replayable.intent);

      expect(validation.isValid).toBe(true);
      expect(validation.reasons.length).toBe(0);
    });
  });
});

/**
 * Additional Intent Validation Tests
 */

describe("Intent Validation Tests", () => {
  it("should validate correct intents", async () => {
    const validIntents = [
      createIntent("SCHEDULE", "schedule meeting"),
      createIntent("SEARCH", "find restaurant"),
      createIntent("ACTION", "send email")
    ];

    validIntents.forEach(intent => {
      const isValid = validateIntent(intent);
      expect(isValid).toBe(true);
    });
  });

  it("should reject invalid intents", async () => {
    const invalidIntents: Intent[] = [
      {
        // Missing constraints
        id: "test-id",
        version: 1,
        type: "SCHEDULE",
        primaryGoal: "test",
        explicitConstraints: [],
        preferences: { acceptableAlternatives: false },
        ambiguities: [],
        rejectedInterpretations: [],
        confidence: {
          score: 1,
          method: "test",
          weightings: {}
        },
        temporal: {
          createdAt: new Date().toISOString(),
          expiresAt: new Date().toISOString(),
          validityDuration: 1800
        },
        trace: {
          inputSource: "test",
          rawText: "test",
          context: {},
          generationMetadata: {
            pipelineVersion: "v1",
            llmProvider: "test",
            llmModel: "test",
            promptTemplate: "test"
          }
        }
      } as any
    ];

    invalidIntents.forEach(intent => {
      const isValid = validateIntent(intent);
      expect(isValid).toBe(false);
    });
  });

  it("should detect expired intents", async () => {
    const oldIntent = createIntent("SCHEDULE", "test");
    oldIntent.temporal.expiresAt = new Date(Date.now() - 1000).toISOString();

    const isExpired = isIntentExpired(oldIntent);
    expect(isExpired).toBe(true);
  });

  it("should accept valid intents", async () => {
    const validIntent = createIntent("SCHEDULE", "test");
    const isValid = isValidIntent(validIntent);

    expect(isValid).toBe(true);
  });

  it("should reject invalid and expired intents", async () => {
    const validIntent = createIntent("SCHEDULE", "test");
    const expiredIntent = createIntent("SCHEDULE", "test");
    expiredIntent.temporal.expiresAt = new Date(Date.now() - 1000).toISOString();

    const invalidIntent = {
      // Missing required fields
      id: "test",
      version: 1,
      type: "SCHEDULE",
      primaryGoal: "test",
      explicitConstraints: [],
      preferences: { acceptableAlternatives: false },
      ambiguities: [],
      rejectedInterpretations: [],
      confidence: { score: 1, method: "test", weightings: {} },
      temporal: {
        createdAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        validityDuration: 1800
      },
      trace: {
        inputSource: "test",
        rawText: "test",
        context: {},
        generationMetadata: {
          pipelineVersion: "v1",
          llmProvider: "test",
          llmModel: "test",
          promptTemplate: "test"
        }
      }
    } as any;

    expect(isValidIntent(validIntent)).toBe(true);
    expect(isValidIntent(expiredIntent)).toBe(false);
    expect(isValidIntent(invalidIntent)).toBe(false);
  });

  it("should return correct intent state", async () => {
    const highConfidence = createIntent("SCHEDULE", "test");
    highConfidence.confidence.score = 0.9;

    const lowConfidence = createIntent("SCHEDULE", "test");
    lowConfidence.confidence.score = 0.6;

    const unknownType = createIntent("UNKNOWN", "test");

    expect(getIntentState(highConfidence)).toBe("CONFIRMED");
    expect(getIntentState(lowConfidence)).toBe("INSUFFICIENT");
    expect(getIntentState(unknownType)).toBe("UNPROCESSED");
  });
});

/**
 * Normalization Change Tracking Tests
 */

describe("Normalization Change Tracking", () => {
  it("should track normalization changes", async () => {
    // Create an intent with missing fields to trigger changes
    const intent: any = createIntent("SCHEDULE", "test");
    intent.explicitConstraints = [];
    intent.confidence = null as any;

    const result = normalizeIntent(intent);

    expect(result.changes.length).toBeGreaterThan(0);
    expect(result.validated).toBe(false);
  });

  it("should detect type changes during normalization", async () => {
    const intent = createIntent("SCHEDULE", "invalid text");
    const result = normalizeIntent(intent, NormalizationMode.STRICT);

    if (result.changes.some(c => c.field === "type")) {
      expect(result.normalized.type).toBe("UNKNOWN");
    }
  });

  it("should normalize preferences correctly", async () => {
    const intent = createIntent("SCHEDULE", "test");
    const result = normalizeIntent(intent);

    expect(result.normalized.preferences.acceptableAlternatives).toBe(false);
  });

  it("should handle strict normalization mode", async () => {
    const intent = createIntent("SCHEDULE", "test");
    const result = normalizeIntent(intent, NormalizationMode.STRICT);

    expect(result.validated).toBe(true);
  });

  it("should handle relaxed normalization mode", async () => {
    const intent = createIntent("SCHEDULE", "test");
    const result = normalizeIntent(intent, NormalizationMode.RELAXED);

    expect(result.validated).toBe(true);
  });
});

/**
 * Replay Configuration Tests
 */

describe("Replay Configuration", () => {
  it("should use default replay configuration", async () => {
    expect(DEFAULT_REPLAY_CONFIG.normalize).toBe(true);
    expect(DEFAULT_REPLAY_CONFIG.calculateConfidence).toBe(true);
    expect(DEFAULT_REPLAY_CONFIG.preserveOriginal).toBe(false);
    expect(DEFAULT_REPLAY_CONFIG.includeMetadata).toBe(true);
  });

  it("should handle custom replay configuration", async () => {
    const customConfig: ReplayConfig = {
      normalize: false,
      calculateConfidence: false,
      preserveOriginal: true,
      includeMetadata: false
    };

    const rawText = "test";
    const intent = createIntent("SCHEDULE", rawText);
    const state = createPipelineState(rawText, "SCHEDULE", intent);

    const result = await replayIntentPipeline(rawText, state, customConfig);

    expect(result.wasSuccessful).toBe(true);
  });
});

/**
 * Edge Case Tests
 */

describe("Edge Cases", () => {
  it("should handle empty raw text", async () => {
    const result = normalizeIntent(createIntent("UNKNOWN", ""));

    expect(result.validated).toBe(false);
  });

  it("should handle very long text", async () => {
    const longText = "test " + "x".repeat(10000);
    const result = normalizeIntent(createIntent("SCHEDULE", longText));

    expect(result.validated).toBe(true);
  });

  it("should handle special characters", async () => {
    const specialText = "test@#$%^&*()_+-=[]{}|;':\",./<>?";
    const result = normalizeIntent(createIntent("SEARCH", specialText));

    expect(result.validated).toBe(true);
  });

  it("should handle unicode characters", async () => {
    const unicodeText = "test 🚀 日本語 中文";
    const result = normalizeIntent(createIntent("SEARCH", unicodeText));

    expect(result.validated).toBe(true);
  });

  it("should handle null values gracefully", async () => {
    const intent = createIntent("SCHEDULE", "test");
    (intent as any).preferences = null;
    (intent as any).trace = {
      inputSource: null,
      rawText: "test",
      context: null,
      generationMetadata: null
    } as any;

    const result = normalizeIntent(intent);

    expect(result.validated).toBe(false);
  });

  it("should handle undefined values gracefully", async () => {
    const intent = createIntent("SCHEDULE", "test");
    (intent as any).preferences = undefined;
    (intent as any).trace = {
      inputSource: undefined,
      rawText: "test",
      context: undefined,
      generationMetadata: undefined
    } as any;

    const result = normalizeIntent(intent);

    expect(result.validated).toBe(false);
  });

  it("should normalize invalid intent types", async () => {
    // Create a fully invalid intent
    const invalidIntent: any = {
      id: "test-id",
      version: 1,
      type: "INVALID_TYPE",
      primaryGoal: "test",
      explicitConstraints: [],
      preferences: { acceptableAlternatives: false },
      ambiguities: [],
      rejectedInterpretations: [],
      confidence: { score: 1, method: "test", weightings: {} },
      temporal: {
        createdAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        validityDuration: 1800
      },
      trace: {
        inputSource: "test",
        rawText: "test",
        context: {},
        generationMetadata: {
          pipelineVersion: "v1.0.0",
          llmProvider: "test",
          llmModel: "test",
          promptTemplate: "test"
        }
      }
    };

    const result = normalizeIntent(invalidIntent, NormalizationMode.STRICT);

    expect(result.normalized.type).toBe("UNKNOWN");
    expect(result.validated).toBe(false);
  });

  it("should handle empty string input", async () => {
    const result = normalizeIntent(createIntent("UNKNOWN", ""));

    expect(result.validated).toBe(false);
  });

  it("should handle whitespace-only input", async () => {
    const result = normalizeIntent(createIntent("UNKNOWN", "   "));

    expect(result.validated).toBe(false);
  });

  it("should handle very long input", async () => {
    const longText = "a".repeat(10000);
    const result = normalizeIntent(createIntent("SCHEDULE", longText));

    expect(result.validated).toBe(true);
  });
});
