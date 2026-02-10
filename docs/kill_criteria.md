# Kill Criteria for IntentionEngine

## FATAL FAILURE DEFINITIONS

If ANY of these conditions are met, the project MUST FAIL and execution must be disabled.

## PHASE 0 KILL CRITERIA

### KILL_001: Intent Types Overlap
**Definition**: Intent types in IntentOntology have ambiguous boundaries or overlapping semantic space.

**Evidence Required**:
- At least 3 examples where an input could map to multiple IntentTypes
- No clear rule-based boundary between types
- Ambiguity not documented as clarification_needed

**Failure Condition**:
```typescript
// If any of these conditions exist, FAIL
1. Example input "Book a flight" can be:
   - SEARCH: "find flights"
   - ACTION: "book a flight"
   - PLANNING: "plan a trip"
2. No clear heuristic to distinguish between them
3. Ambiguity not surfaced as clarification_needed
```

**Validation Method**:
```typescript
function testIntentTypeBoundaries(): boolean {
  const boundaryCases = [
    "Book a flight",
    "Check weather",
    "Send email to John",
    "Call John",
    "Schedule meeting",
    "Send reminder"
  ];

  for (const case_ of boundaryCases) {
    const results = new Set<IntentType>();

    // Simulate multiple type assignments
    if (hasSearchIntent(case_)) results.add("SEARCH");
    if (hasActionIntent(case_)) results.add("ACTION");
    if (hasPlanningIntent(case_)) results.add("PLANNING");

    // If multiple types possible and not clarification_needed, FAIL
    if (results.size > 1 && !isClarificationNeeded(case_)) {
      return false;
    }
  }
  return true;
}
```

**Test Command**:
```bash
npm run test:phase0:kill_001
```

---

### KILL_002: Exclusions Not Explicitly Documented
**Definition**: Non-Intents (chatbot responses, greetings, etc.) are not explicitly excluded from interpretation.

**Evidence Required**:
- No formal list of rejected input categories
- System processes non-intents as Intent objects
- No explicit handling for: greetings, farewells, empty inputs

**Failure Condition**:
```typescript
// If these are NOT handled, FAIL
1. Greeting "Hello" creates Intent object
2. Empty input "" creates Intent object with UNKNOWN type
3. Farewell "Bye" creates Intent object
4. No formal exclusion list exists
```

**Validation Method**:
```typescript
function testExclusions(): boolean {
  const nonIntents = [
    "Hello",
    "Hi there",
    "Bye",
    "See you later",
    "",
    "Just testing"
  ];

  for (const input of nonIntents) {
    const result = parseIntent(input);
    // If result is NOT null/undefined/clarification_needed, FAIL
    if (result &&
        result.type !== "clarification_needed" &&
        result.type !== "UNKNOWN") {
      return false;
    }
  }
  return true;
}
```

**Test Command**:
```bash
npm run test:phase0:kill_002
```

---

### KILL_003: Ambiguity Definition Insufficient
**Definition**: Ambiguity is not formally defined with handling requirements.

**Evidence Required**:
- No explicit definition of when clarification_needed applies
- No requirement for multiple hypotheses
- No requirement for rejected interpretations
- Single-hypothesis outputs allowed

**Failure Condition**:
```typescript
// If any of these exist, FAIL
1. Ambiguous input produces single-hypothesis intent
2. No requirement for rejectedInterpretations field
3. No requirement for multiple hypotheses in ambiguities
4. Clarification not required for high-ambiguity inputs
```

**Validation Method**:
```typescript
function testAmbiguityDefinition(): boolean {
  const ambiguousInputs = [
    "Send John an email",
    "Call John",
    "Update John",
    "Help John"
  ];

  for (const input of ambiguousInputs) {
    const result = parseIntent(input);

    // If result is NOT clarification_needed, FAIL
    if (result.type !== "clarification_needed") {
      // Check if rejectedInterpretations exists
      if (!result.rejectedInterpretations ||
          result.rejectedInterpretations.length === 0) {
        return false;
      }

      // Check if ambiguities exist
      if (!result.ambiguities ||
          result.ambiguities.length === 0) {
        return false;
      }
    }
  }
  return true;
}
```

**Test Command**:
```bash
npm run test:phase0:kill_003
```

---

## PHASE 1 KILL CRITERIA

### KILL_004: Deterministic Normalization Missing
**Definition**: Intent objects are not deterministically normalized (produce identical output for identical input).

**Evidence Required**:
- Same input produces different Intent objects across runs
- No deterministic normalization layer
- Non-deterministic behavior in normalization

**Failure Condition**:
```typescript
// If these conditions exist, FAIL
1. parseIntent("book a meeting") produces different objects across runs
2. Normalization function not implemented
3. Normalization depends on non-deterministic sources (random seeds, time, etc.)
4. No test requiring 100% determinism
```

**Validation Method**:
```typescript
async function testDeterministicNormalization(): Promise<boolean> {
  const testCases = [
    "Schedule a meeting at 2pm tomorrow",
    "book a meeting for tomorrow at 3",
    "meeting scheduled for 2026-02-11T15:00:00Z"
  ];

  const runs = 100;
  const results = [];

  for (let i = 0; i < runs; i++) {
    const normalized = [];
    for (const testCase of testCases) {
      const intent = await inferIntent(testCase);
      const normalizedIntent = normalizeIntent(intent.intent);
      normalized.push(JSON.stringify(normalizedIntent));
    }
    results.push(JSON.stringify(normalized));
  }

  // If any variation exists, FAIL
  const uniqueResults = new Set(results);
  return uniqueResults.size === 1;
}
```

**Test Command**:
```bash
npm run test:phase1:kill_004
```

---

### KILL_005: Confidence Score Not Deterministic
**Definition**: Confidence scores are not determined solely by user input and code rules (not LLM randomness).

**Evidence Required**:
- Same input produces different confidence scores
- Confidence depends on LLM randomness
- No deterministic scoring rules

**Failure Condition**:
```typescript
// If these exist, FAIL
1. parseIntent("book meeting") produces different confidence values
2. Confidence depends on LLM temperature or other non-deterministic factors
3. No explicit scoring algorithm
4. Confidence can vary without user input changes
```

**Validation Method**:
```typescript
async function testDeterministicConfidence(): Promise<boolean> {
  const runs = 100;
  const testCases = [
    "book a meeting",
    "schedule meeting",
    "meeting appointment"
  ];

  for (const testCase of testCases) {
    const confidenceValues = [];

    for (let i = 0; i < runs; i++) {
      const result = await inferIntent(testCase);
      confidenceValues.push(result.intent.confidence.score);
    }

    // If any variation exists, FAIL
    const uniqueValues = new Set(confidenceValues);
    if (uniqueValues.size > 1) {
      console.log(`Test case "${testCase}" produced ${uniqueValues.size} unique confidence values`);
      return false;
    }
  }
  return true;
}
```

**Test Command**:
```bash
npm run test:phase1:kill_005
```

---

### KILL_006: Replay Harness Not Implemented
**Definition**: No mechanism to replay pipeline steps and reconstruct Intent objects from raw input.

**Evidence Required**:
- No replay function
- No way to trace back from Intent to input
- No historical reconstruction

**Failure Condition**:
```typescript
// If any of these exist, FAIL
1. No function called replayIntentPipeline(input)
2. Cannot reconstruct intent from stored artifacts
3. No preserved pipeline state
4. Intent objects cannot be verified as traceable
```

**Validation Method**:
```typescript
async function testReplayHarness(): Promise<boolean> {
  const testCases = [
    "book meeting at 3pm",
    "find restaurants near me",
    "send email to John"
  ];

  for (const testCase of testCases) {
    // 1. Run pipeline
    const result1 = await inferIntent(testCase);
    const storedState = serializePipelineState(result1.intent);

    // 2. Replay
    const replayedIntent = await replayIntentPipeline(testCase, storedState);

    // 3. Compare
    const normalized1 = normalizeIntent(result1.intent);
    const normalized2 = normalizeIntent(replayedIntent);

    if (!deepEqual(normalized1, normalized2)) {
      return false;
    }
  }
  return true;
}
```

**Test Command**:
```bash
npm run test:phase1:kill_006
```

---

## PHASE 2 KILL CRITERIA

### KILL_007: Ambiguity Surfacing Incomplete
**Definition**: Ambiguous inputs do not produce multiple hypotheses or ranked alternatives.

**Evidence Required**:
- Single-hypothesis outputs for ambiguous inputs
- No ranked alternatives
- No clarification questions
- Ambiguity not surfaced as clarification_needed

**Failure Condition**:
```typescript
// If any of these exist, FAIL
1. parseIntent("Call John") produces single-hypothesis intent
2. No ranked list of alternatives
3. No clarification question present
4. Ambiguity type 'clarification_needed' not enforced
```

**Validation Method**:
```typescript
async function testAmbiguitySurfacing(): Promise<boolean> {
  const ambiguousInputs = [
    "Call John",
    "Update John",
    "Help John",
    "Email John",
    "Message John"
  ];

  for (const input of ambiguousInputs) {
    const result = await inferIntent(input);

    // Type must be clarification_needed
    if (result.intent.type !== "clarification_needed") {
      return false;
    }

    // Must have clarification question
    if (!result.intent.question) {
      return false;
    }

    // Must have multiple hypotheses
    if (result.intent.ambiguities.length < 2) {
      return false;
    }

    // Must have rejected interpretations
    if (result.intent.rejectedInterpretations.length === 0) {
      return false;
    }

    // Alternatives must be ranked (by confidence)
    if (!areAlternativesRanked(result.intent.ambiguities)) {
      return false;
    }
  }
  return true;
}
```

**Test Command**:
```bash
npm run test:phase2:kill_007
```

---

### KILL_008: Insufficient Intent State Missing
**Definition**: No explicit "insufficient intent" state (prior to clarification_needed).

**Evidence Required**:
- No validation state for incomplete intents
- No mechanism to track intent evolution
- No state machine for intent lifecycle

**Failure Condition**:
```typescript
// If any of these exist, FAIL
1. No validation state enum (UNPROCESSED, VALIDATING, CONFIRMED, INSUFFICIENT, REJECTED)
2. No mechanism to mark intent as "insufficient"
3. No tracking of clarification attempts
4. No state machine for intent lifecycle
```

**Validation Method**:
```typescript
function testInsufficientIntentState(): boolean {
  const stateMachine = {
    UNPROCESSED: [],
    VALIDATING: ["INSUFFICIENT"],
    INSUFFICIENT: ["VALIDATING", "CONFIRMED"],
    CONFIRMED: [],
    REJECTED: []
  };

  // Verify transition rules exist
  for (const [state, transitions] of Object.entries(stateMachine)) {
    if (transitions.length === 0) {
      return false;
    }
  }

  // Verify state enum exists
  if (!IntentState || !IntentState.INSUFFICIENT) {
    return false;
  }

  return true;
}
```

**Test Command**:
```bash
npm run test:phase2:kill_008
```

---

## PHASE 3 KILL CRITERIA

### KILL_009: Intent Versioning Broken
**Definition**: Intent versioning does not support immutable history and supersession semantics.

**Evidence Required**:
- No version increment mechanism
- No immutable history
- Version downgrade allowed
- No supersession tracking

**Failure Condition**:
```typescript
// If any of these exist, FAIL
1. version field can decrease
2. No immutable history per intent
3. Cannot supersede previous version
4. No version metadata
```

**Validation Method**:
```typescript
function testIntentVersioning(): boolean {
  let version = 1;
  const history = [];

  // 1. Initial version
  history.push({ version: 1, timestamp: "now", intent: {} });

  // 2. Supersede
  version++;
  history.push({ version, timestamp: "now", intent: {} });

  // 3. Downgrade not allowed
  if (version > 1) {
    version--; // Should fail or throw
    return false;
  }

  // 4. History must be immutable
  try {
    history[0].intent = "tampered";
    return false;
  } catch (e) {
    // Expected
  }

  return true;
}
```

**Test Command**:
```bash
npm run test:phase3:kill_009
```

---

### KILL_010: History Tracking Missing
**Definition**: No immutable history tracking for intent evolution.

**Evidence Required**:
- No history array
- History not immutable
- No metadata about changes

**Failure Condition**:
```typescript
// If any of these exist, FAIL
1. No history per intent
2. History mutable
3. No change type tracking
4. No audit trail
```

**Validation Method**:
```typescript
function testHistoryTracking(): boolean {
  const intent = createIntent("book meeting");

  // Add change
  intent.addHistory({
    type: "UPDATE",
    from: { type: "UNKNOWN" },
    to: { type: "SCHEDULE" },
    reason: "parsed successfully"
  });

  // Verify history
  if (intent.history.length !== 1) {
    return false;
  }

  // History must be immutable
  try {
    intent.history.push({}); // Should fail
    return false;
  } catch (e) {
    // Expected
  }

  return true;
}
```

**Test Command**:
```bash
npm run test:phase3:kill_010
```

---

## PHASE 4 KILL CRITERIA

### KILL_011: Action Binding Not Traceable
**Definition**: Intent → capability binding is not traceable or reversible.

**Evidence Required**:
- No intent → action mapping
- No verification of action suitability
- No dry-run mechanism
- No execution confirmation requirements

**Failure Condition**:
```typescript
// If any of these exist, FAIL
1. Intent executes without verification
2. No dry-run mode
3. No confirmation requirement
4. No trace from intent to action
```

**Validation Method**:
```typescript
async function testActionBindingTraceability(): Promise<boolean> {
  const intents = [
    { type: "SCHEDULE", params: { meeting: "book" } },
    { type: "SEARCH", params: { entity: "restaurant" } }
  ];

  for (const intent of intents) {
    // 1. Get binding
    const binding = getActionBinding(intent);

    // 2. Verify binding exists
    if (!binding) {
      return false;
    }

    // 3. Dry-run
    const dryRun = await dryRun(binding);

    // 4. Verify confirmation required
    if (!dryRun.requiresConfirmation) {
      return false;
    }

    // 5. Trace from action back to intent
    if (!getIntentFromAction(binding.action)) {
      return false;
    }
  }
  return true;
}
```

**Test Command**:
```bash
npm run test:phase4:kill_011
```

---

### KILL_012: Execution Plans Not Validated
**Definition**: Execution plans are not validated before execution.

**Evidence Required**:
- Plans execute without validation
- No dry-run mode
- No safety checks
- No confirmation requirements

**Failure Condition**:
```typescript
// If any of these exist, FAIL
1. Plans execute immediately
2. No validation before execution
3. No safety checks
4. No confirmation required
```

**Validation Method**:
```typescript
async function testExecutionPlanValidation(): Promise<boolean> {
  const unsafePlans = [
    { type: "DELETE", target: "all_records" },
    { type: "SYSTEM", target: "critical_services" },
    { type: "EXECUTE", command: "rm -rf /" }
  ];

  for (const plan of unsafePlans) {
    // Must be blocked
    const result = await validatePlan(plan);
    if (result.valid && result.actionable) {
      return false;
    }

    // Must require confirmation
    if (!result.requiresConfirmation) {
      return false;
    }

    // Must have safety check
    if (!result.safetyCheck) {
      return false;
    }
  }
  return true;
}
```

**Test Command**:
```bash
npm run test:phase4:kill_012
```

---

## PHASE 5 KILL CRITERIA

### KILL_013: Silent Failure Mode
**Definition**: System fails silently under adversarial or degraded conditions.

**Evidence Required**:
- No adversarial input handling
- No degradation detection
- No explicit failure paths
- System appears to work when it's failing

**Failure Condition**:
```typescript
// If any of these exist, FAIL
1. System processes adversarial inputs without detection
2. Degradation not detected (latency, cost, accuracy)
3. No explicit failure states
4. No graceful degradation
```

**Validation Method**:
```typescript
async function testSilentFailureMode(): Promise<boolean> {
  // 1. Adversarial inputs
  const adversarial = generateAdversarialInputs(100);
  for (const input of adversarial) {
    // Must not crash or produce invalid state
    try {
      const result = await inferIntent(input);
      if (!isValidIntent(result.intent)) {
        return false;
      }
    } catch (e) {
      // Explicit error is acceptable
      if (!isExpectedError(e)) {
        return false;
      }
    }
  }

  // 2. Degradation conditions
  const degraded = testDegradationConditions();
  if (degraded) {
    // Must detect and report
    const detection = detectDegradation();
    if (!detection) {
      return false;
    }
  }

  return true;
}
```

**Test Command**:
```bash
npm run test:phase5:kill_013
```

---

### KILL_014: Conflict Resolution Missing
**Definition**: Conflicting intents are not detected or resolved.

**Evidence Required**:
- No conflict detection
- No resolution mechanism
- Conflicting intents accepted
- No audit trail of conflicts

**Failure Condition**:
```typescript
// If any of these exist, FAIL
1. Conflicting intents accepted
2. No conflict detection
3. No resolution mechanism
4. No conflict logging
```

**Validation Method**:
```typescript
async function testConflictResolution(): Promise<boolean> {
  const conflictingIntents = [
    { type: "SCHEDULE", start: "tomorrow", end: "tomorrow" },
    { type: "CANCEL", target: "meeting tomorrow" }
  ];

  for (const pair of conflictingIntents) {
    const conflict = detectIntentConflict(pair[0], pair[1]);
    if (!conflict) {
      return false;
    }

    const resolution = resolveConflict(conflict);
    if (!resolution) {
      return false;
    }

    if (!resolution.auditTrail) {
      return false;
    }
  }
  return true;
}
```

**Test Command**:
```bash
npm run test:phase5:kill_014
```

---

## KILL CRITERIA SUMMARY

### Kill Criteria Count: 14

| Phase | Kill Criteria | Count |
|-------|---------------|-------|
| Phase 0 | Intent Types Overlap, Exclusions, Ambiguity Definition | 3 |
| Phase 1 | Deterministic Normalization, Confidence Score, Replay Harness | 3 |
| Phase 2 | Ambiguity Surfacing, Insufficient Intent State | 2 |
| Phase 3 | Versioning, History Tracking | 2 |
| Phase 4 | Action Binding, Execution Plans | 2 |
| Phase 5 | Silent Failure, Conflict Resolution | 2 |

### Critical Gates

If ANY of these criteria are violated, the system MUST:
1. FAIL the gate
2. Disable execution
3. Require redesign before proceeding
4. Document the specific failure

### Testing Requirements

Each kill criteria must have:
- Automated test
- Pass rate requirement: 100%
- Timeout: 30 seconds per test
- Coverage: All code paths must be tested
