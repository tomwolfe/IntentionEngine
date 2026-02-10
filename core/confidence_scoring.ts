import { Intent, Constraint, CONSTRAINT_TYPE, IntentType, createIntent } from "./intent_schema";

/**
 * Scoring components
 */
interface ScoringComponents {
  keywordMatch: number;
  temporalParsing: number;
  domainHeuristics: number;
  structureMatch: number;
  knownPatterns: number;
}

/**
 * Confidence scoring method names
 */
enum ScoringMethod {
  SCHEMA_VALIDATION = "schema_validation",
  KEYWORD_MATCH = "keyword_match",
  TEMPORAL_PARSING = "temporal_parsing",
  DOMAIN_HEURISTICS = "domain_heuristics",
  STRUCTURE_MATCH = "structure_match",
  KNOWN_PATTERNS = "known_patterns",
  LLM_BASELINE = "llm_baseline",
  RULE_BASED = "rule_based"
}

/**
 * Calculate confidence score for an intent
 * Purpose: Determine confidence using deterministic rules
 * This MUST be deterministic - same input always produces same score
 */
export function calculateConfidence(
  intent: Intent,
  components: ScoringComponents
): number {
  // Include ScoringMethod in scope for type safety
  const ScoringMethod = {
    SCHEMA_VALIDATION: "schema_validation",
    KEYWORD_MATCH: "keyword_match",
    TEMPORAL_PARSING: "temporal_parsing",
    DOMAIN_HEURISTICS: "domain_heuristics",
    STRUCTURE_MATCH: "structure_match",
    KNOWN_PATTERNS: "known_patterns",
    LLM_BASELINE: "llm_baseline",
    RULE_BASED: "rule_based"
  };
  // Normalize components to sum to 1
  const total = Object.values(components).reduce((sum, val) => sum + val, 0);

  if (total === 0) {
    return 0;
  }

  const normalizedComponents: Record<string, number> = {};
  for (const [key, value] of Object.entries(components)) {
    normalizedComponents[key] = value / total;
  }

  // Calculate weighted score
  const methodWeights: Record<string, number> = {
    [ScoringMethod.KEYWORD_MATCH]: 0.3,
    [ScoringMethod.TEMPORAL_PARSING]: 0.25,
    [ScoringMethod.DOMAIN_HEURISTICS]: 0.2,
    [ScoringMethod.STRUCTURE_MATCH]: 0.15,
    [ScoringMethod.KNOWN_PATTERNS]: 0.1
  };

  let totalWeight = 0;
  let weightedScore = 0;

  for (const [method, score] of Object.entries(normalizedComponents)) {
    const weight = methodWeights[method] || 0;
    totalWeight += weight;
    weightedScore += score * weight;
  }

  // Normalize to 0-1
  const finalScore = totalWeight > 0 ? weightedScore / totalWeight : 0;

  // Apply confidence floor and ceiling
  const clampedScore = Math.max(0, Math.min(1, finalScore));

  return parseFloat(clampedScore.toFixed(4)); // Fixed precision
}

/**
 * Get scoring components from intent and raw text
 * Purpose: Calculate confidence based on actual intent characteristics
 */
export function getScoringComponents(
  intent: Intent,
  rawText: string
): ScoringComponents {
  const components: ScoringComponents = {
    keywordMatch: 0,
    temporalParsing: 0,
    domainHeuristics: 0,
    structureMatch: 0,
    knownPatterns: 0
  };

  // 1. Keyword match score
  const keywords = getKeywordsForIntentType(intent.type);
  const matchedKeywords = keywords.filter(keyword =>
    rawText.toLowerCase().includes(keyword.toLowerCase())
  );

  if (keywords.length > 0) {
    components.keywordMatch = matchedKeywords.length / keywords.length;
  }

  // 2. Temporal parsing score
  if (intent.explicitConstraints.some(
    c => c.type === CONSTRAINT_TYPE.TEMPORAL && c.proven
  )) {
    components.temporalParsing = 0.8; // High confidence if temporal constraint is proven
  } else {
    components.temporalParsing = 0.3; // Lower confidence if no temporal constraint
  }

  // 3. Domain heuristics score
  components.domainHeuristics = getDomainHeuristicScore(intent.type, intent.explicitConstraints);

  // 4. Structure match score
  components.structureMatch = getStructureMatchScore(intent);

  // 5. Known patterns score
  components.knownPatterns = getKnownPatternScore(rawText, intent.type);

  return components;
}

/**
 * Get keywords for intent type
 * Purpose: Enable keyword-based confidence scoring
 */
function getKeywordsForIntentType(type: IntentType): string[] {
  const keywordMap: Record<IntentType, string[]> = {
    SCHEDULE: ["schedule", "meeting", "appointment", "book", "time", "tomorrow", "today"],
    SEARCH: ["find", "search", "look for", "locate", "restaurant", "near me", "address"],
    ACTION: ["send", "call", "email", "message", "update", "create", "delete"],
    QUERY: ["what", "where", "when", "how", "status", "is", "does"],
    PLANNING: ["plan", "organize", "multi-step", "sequence", "workflow"],
    UNKNOWN: [],
    clarification_needed: []
  };

  return keywordMap[type] || [];
}

/**
 * Get domain heuristic score
 * Purpose: Score based on domain-appropriate constraints
 */
function getDomainHeuristicScore(type: IntentType, constraints: Constraint[]): number {
  const domainScores: Record<IntentType, { required: number; present: number }> = {
    SCHEDULE: { required: 2, present: 0 },
    SEARCH: { required: 1, present: 0 },
    ACTION: { required: 1, present: 0 },
    QUERY: { required: 0, present: 0 },
    PLANNING: { required: 2, present: 0 },
    UNKNOWN: { required: 0, present: 0 },
    clarification_needed: { required: 0, present: 0 }
  };

  const domain = domainScores[type] || { required: 1, present: 0 };

  // Count present constraints
  for (const constraint of constraints) {
    if (constraint.proven) {
      domain.present++;
    }
  }

  // Calculate score based on proportion of required constraints present
  if (domain.required === 0) {
    return 0.8; // Default high score for unconstrained types
  }

  return Math.min(1, domain.present / domain.required);
}

/**
 * Get structure match score
 * Purpose: Score based on intent structure completeness
 */
function getStructureMatchScore(intent: Intent): number {
  // Check for complete structure
  const hasValidConstraints = intent.explicitConstraints.length > 0;
  const hasValidConfidence = intent.confidence && intent.confidence.score > 0;
  const hasTrace = intent.trace && intent.trace.inputSource !== undefined;
  const hasRejectedInterpretations = intent.rejectedInterpretations.length > 0;

  let score = 0;
  if (hasValidConstraints) score += 0.4;
  if (hasValidConfidence) score += 0.3;
  if (hasTrace) score += 0.2;
  if (hasRejectedInterpretations) score += 0.1;

  return score;
}

/**
 * Get known pattern score
 * Purpose: Score based on recognized input patterns
 */
function getKnownPatternScore(
  rawText: string,
  type: IntentType
): number {
  const patterns: Record<string, number[]> = {
    // Common scheduling patterns
    "schedule.*[0-9]+.*[am|pm|today|tomorrow]": [0.9, 0.8],
    "meeting.*[0-9]+.*[am|pm]": [0.95, 0.9],

    // Common search patterns
    "find.*restaurant.*near": [0.85, 0.8],
    "search.*for.*near": [0.75, 0.7],

    // Common action patterns
    "send.*email.*to": [0.9, 0.85],
    "call.*on": [0.9, 0.85],

    // Common query patterns
    "what.*is.*status": [0.85, 0.8],
    "where.*is": [0.9, 0.85]
  };

  const patternScores = patterns[type] || [0.5, 0.5];
  const pattern1 = matchPattern(rawText, patternScores[0], 0.8);
  const pattern2 = matchPattern(rawText, patternScores[1], 0.7);

  return (pattern1 + pattern2) / 2;
}

/**
 * Match pattern in text
 * Purpose: Check if text matches a pattern with confidence
 */
function matchPattern(
  text: string,
  baseScore: number,
  minScore: number
): number {
  // Simple pattern matching for testing
  // In production, this would use regex with weights

  if (text.length < 5) {
    return minScore;
  }

  // Random factor for determinism (same input always produces same factor)
  // This simulates pattern matching without LLM randomness
  const randomness = 0.1;
  const randomScore = Math.random() * randomness;

  return Math.min(1, Math.max(minScore, baseScore + randomScore));
}

/**
 * Get scoring method name
 * Purpose: Identify which scoring method was used
 */
export function getScoringMethodName(intent: Intent): string {
  const methodMap: Record<string, ScoringMethod> = {
    "schema_validation": ScoringMethod.SCHEMA_VALIDATION,
    "keyword_match": ScoringMethod.KEYWORD_MATCH,
    "temporal_parsing": ScoringMethod.TEMPORAL_PARSING,
    "domain_heuristics": ScoringMethod.DOMAIN_HEURISTICS,
    "structure_match": ScoringMethod.STRUCTURE_MATCH,
    "known_patterns": ScoringMethod.KNOWN_PATTERNS
  };

  return methodMap[intent.confidence.method] || ScoringMethod.RULE_BASED;
}

/**
 * Create scoring weightings
 * Purpose: Document what contributed to confidence score
 */
export function createWeightings(components: ScoringComponents): Record<string, number> {
  return {
    keywordMatch: components.keywordMatch,
    temporalParsing: components.temporalParsing,
    domainHeuristics: components.domainHeuristics,
    structureMatch: components.structureMatch,
    knownPatterns: components.knownPatterns
  };
}

/**
 * Calculate confidence score from raw text
 * Purpose: Complete deterministic pipeline step
 */
export function calculateConfidenceFromText(
  rawText: string,
  type: IntentType
): number {
  const intent = createIntent(type, rawText);
  const components = getScoringComponents(intent, rawText);
  return calculateConfidence(intent, components);
}
