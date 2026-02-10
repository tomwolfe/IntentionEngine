import { z } from "zod";

/**
 * Constraint types for explicit validation
 */
export enum CONSTRAINT_TYPE {
  TEMPORAL = "TEMPORAL",
  SPATIAL = "SPATIAL",
  RESOURCE = "RESOURCE",
  PERMISSION = "PERMISSION",
  BUSINESS_RULE = "BUSINESS_RULE"
}

/**
 * Intent type definitions
 * Purpose: Provide clear, non-overlapping categories for user goals
 */
export const IntentTypeSchema = z.enum([
  "SCHEDULE",      // Time-bound tasks with specific constraints
  "SEARCH",        // Informational search or entity location
  "ACTION",        // Single-step operations
  "QUERY",         // Status checks or knowledge questions
  "PLANNING",      // Multi-step tasks requiring orchestration
  "UNKNOWN",       // Unsupported or unrecognizable input
  "clarification_needed",  // Ambiguous input requiring clarification
]);

export type IntentType = z.infer<typeof IntentTypeSchema>;

/**
 * Constraint object for explicit validation
 */
export const ConstraintSchema = z.object({
  type: z.nativeEnum(CONSTRAINT_TYPE),
  value: z.any(),
  validatedBy: z.string(),
  proven: z.boolean().default(false),
});

export type Constraint = z.infer<typeof ConstraintSchema>;

/**
 * Ambiguity tracking object
 */
export const AmbiguitySchema = z.object({
  originalText: z.string(),
  hypotheses: z.array(z.string()).min(2),
  resolved: z.boolean().default(false),
  resolution: z.string().optional(),
});

export type Ambiguity = z.infer<typeof AmbiguitySchema>;

/**
 * Rejected interpretation object
 */
export const RejectedInterpretationSchema = z.object({
  candidate: z.string(),
  rejectionReason: z.string(),
  confidenceScore: z.number().min(0).max(1),
});

export type RejectedInterpretation = z.infer<typeof RejectedInterpretationSchema>;

/**
 * Intent preferences
 */
export const IntentPreferencesSchema = z.object({
  priority: z.enum(["high", "medium", "low"]).optional(),
  urgency: z.number().min(1).max(10).optional(),
  acceptableAlternatives: z.boolean().default(false),
});

export type IntentPreferences = z.infer<typeof IntentPreferencesSchema>;

/**
 * Confidence scoring metadata
 */
export const ConfidenceMetadataSchema = z.object({
  score: z.number().min(0).max(1),
  method: z.string(),
  weightings: z.record(z.any()),
});

export type ConfidenceMetadata = z.infer<typeof ConfidenceMetadataSchema>;

/**
 * Trace metadata
 */
export const TraceMetadataSchema = z.object({
  inputSource: z.string(),
  rawText: z.string(),
  context: z.object({
    sessionId: z.string().optional(),
    userContext: z.any().optional(),
    environment: z.string().optional(),
  }).optional(),
  generationMetadata: z.object({
    pipelineVersion: z.string(),
    llmProvider: z.string(),
    llmModel: z.string(),
    promptTemplate: z.string(),
  }),
});

export type TraceMetadata = z.infer<typeof TraceMetadataSchema>;

/**
 * Intent validation state
 */
export enum IntentState {
  UNPROCESSED = "UNPROCESSED",
  VALIDATING = "VALIDATING",
  CONFIRMED = "CONFIRMED",
  INSUFFICIENT = "INSUFFICIENT",  // Needs clarification
  REJECTED = "REJECTED",
  EXECUTED = "EXECUTED",
}

/**
 * Intent trace entry
 */
export const TraceEntrySchema = z.object({
  type: z.string(),
  from: z.any().optional(),
  to: z.any().optional(),
  timestamp: z.string(),
  reason: z.string(),
});

export type TraceEntry = z.infer<typeof TraceEntrySchema>;

/**
 * The canonical Intent schema.
 * This represents the structured interpretation of a raw user input.
 */
export const IntentSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int().positive(),
  type: IntentTypeSchema,

  // User goals (EXPLICIT)
  primaryGoal: z.string(),
  explicitConstraints: z.array(ConstraintSchema).min(1),

  // User preferences
  preferences: IntentPreferencesSchema,

  // Ambiguity tracking (MANDATORY for low confidence)
  ambiguities: z.array(AmbiguitySchema).min(0),

  // Rejected interpretations (MANDATORY)
  rejectedInterpretations: z.array(RejectedInterpretationSchema).min(1),

  // Non-LLM confidence score
  confidence: ConfidenceMetadataSchema,

  // Temporal validity
  temporal: z.object({
    createdAt: z.string().datetime(),
    expiresAt: z.string().datetime().optional(),
    validityDuration: z.number().positive().optional(),
  }),

  // Traceability
  trace: TraceMetadataSchema,
});

export type Intent = z.infer<typeof IntentSchema>;

/**
 * Create a minimal intent for testing purposes
 */
export function createIntent(
  type: IntentType,
  rawText: string,
  options: Partial<Omit<Intent, 'id' | 'version'>> = {}
): Intent {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  return IntentSchema.parse({
    id,
    version: 1,
    type,
    primaryGoal: options.primaryGoal || rawText,
    explicitConstraints: options.explicitConstraints || [
      {
        type: CONSTRAINT_TYPE.TEMPORAL,
        value: "temporal_validation",
        validatedBy: "schema_validation",
        proven: true,
      }
    ],
    preferences: options.preferences || {},
    ambiguities: options.ambiguities || [],
    rejectedInterpretations: options.rejectedInterpretations || [
      {
        candidate: "unknown",
        rejectionReason: "not_applied",
        confidenceScore: 0,
      }
    ],
    confidence: {
      score: 1.0,
      method: "schema_validation",
      weightings: {},
    },
    temporal: {
      createdAt: now,
      expiresAt: new Date(Date.now() + 1800000).toISOString(),
      validityDuration: 1800,
    },
    trace: {
      inputSource: "test",
      rawText,
      context: {},
      generationMetadata: {
        pipelineVersion: "v1.0.0",
        llmProvider: "test",
        llmModel: "test",
        promptTemplate: "test",
      },
    },
  });
}
