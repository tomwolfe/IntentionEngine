import { convertRawPlanToPlan, RawPlan } from "../lib/engine/planner.js";
import { Intent, PlanConstraints, ToolDefinition } from "../lib/engine/types.js";
import { randomUUID } from "crypto";

async function testPlannerFanOut() {
  console.log("--- TEST: Planner Fan-Out Logic ---");

  const mockIntent: Intent = {
    id: randomUUID(),
    type: "QUERY",
    confidence: 0.98,
    parameters: { location: ["Tokyo", "London", "NY"] },
    raw_input: "What is the weather in Tokyo, London, and NY?",
    explanation: "User is asking for weather information for multiple locations",
    metadata: {
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      source: "user_input",
    },
    requires_clarification: false,
  };

  const mockConstraints: PlanConstraints = {
    max_steps: 10,
    max_total_tokens: 8000,
    max_execution_time_ms: 120000,
  };

  const weatherTool: ToolDefinition = {
    name: "get_weather",
    version: "1.0.0",
    description: "Get weather for a location",
    inputSchema: {
      type: "object",
      properties: {
        location: { type: "string", description: "The city name" },
      },
      required: ["location"],
    },
    return_schema: {},
    category: "data",
    timeout_ms: 30000,
    requires_confirmation: false,
  };

  // Test 1: Basic Fan-Out
  console.log("Test 1: Basic Fan-Out...");
  const rawPlan1: RawPlan = {
    steps: [
      {
        step_number: 0,
        tool_name: "get_weather",
        parameters: { location: ["Tokyo", "London", "NY"] },
        dependencies: [],
        description: "Get weather for requested locations",
        requires_confirmation: false,
        estimated_tokens: 100,
      },
    ],
    summary: "Get weather for Tokyo, London, and NY",
    estimated_total_tokens: 300,
    estimated_latency_ms: 2000,
  };

  const plan1 = convertRawPlanToPlan(
    rawPlan1,
    mockIntent,
    mockConstraints,
    "gpt-4o",
    [weatherTool]
  );

  if (plan1.steps.length === 3) {
    console.log("PASS: Fanned out to 3 steps.");
  } else {
    console.error(`FAIL: Expected 3 steps, got ${plan1.steps.length}`);
    process.exit(1);
  }

  const locations = plan1.steps.map(s => s.parameters.location);
  if (locations.includes("Tokyo") && locations.includes("London") && locations.includes("NY")) {
    console.log("PASS: All locations present in fanned-out steps.");
  } else {
    console.error(`FAIL: Missing locations. Got: ${locations}`);
    process.exit(1);
  }

  // Test 2: Dependencies handling
  console.log("Test 2: Dependencies handling...");
  const rawPlan2: RawPlan = {
    steps: [
      {
        step_number: 0,
        tool_name: "get_weather",
        parameters: { location: ["Tokyo", "London"] },
        dependencies: [],
        description: "Get weather",
        requires_confirmation: false,
        estimated_tokens: 100,
      },
      {
        step_number: 1,
        tool_name: "log",
        parameters: { message: "Weather retrieved" },
        dependencies: [0],
        description: "Log completion",
        requires_confirmation: false,
        estimated_tokens: 50,
      }
    ],
    summary: "Get weather and log",
    estimated_total_tokens: 250,
    estimated_latency_ms: 2000,
  };

  const plan2 = convertRawPlanToPlan(
    rawPlan2,
    mockIntent,
    mockConstraints,
    "gpt-4o",
    [weatherTool]
  );

  if (plan2.steps.length === 3) {
    console.log("PASS: Fanned out correctly (2 weather + 1 log).");
  } else {
    console.error(`FAIL: Expected 3 steps, got ${plan2.steps.length}`);
    process.exit(1);
  }

  const weatherStepIds = plan2.steps.filter(s => s.tool_name === "get_weather").map(s => s.id);
  const logStep = plan2.steps.find(s => s.tool_name === "log");

  if (logStep?.dependencies.length === 2 && weatherStepIds.every(id => logStep.dependencies.includes(id))) {
    console.log("PASS: Log step correctly depends on all fanned-out weather steps.");
  } else {
    console.error(`FAIL: Incorrect dependencies for log step. Got: ${logStep?.dependencies}`);
    process.exit(1);
  }

  console.log("--- ALL TESTS PASSED ---");
}

testPlannerFanOut().catch(err => {
  console.error(err);
  process.exit(1);
});
