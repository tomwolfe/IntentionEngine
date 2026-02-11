import { executePlan, ToolExecutor } from "../engine/orchestrator";
import { Plan } from "../engine/types";
import { randomUUID } from "crypto";

async function testParallelExecution() {
  console.log("--- TEST: Parallel Execution ---");

  const mockToolExecutor: ToolExecutor = {
    execute: async (name, params, timeout) => {
      console.log(`Starting ${name}...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log(`Finished ${name}.`);
      return { success: true, output: { result: "ok" }, latency_ms: 1000 };
    }
  };

  const plan: Plan = {
    id: randomUUID(),
    intent_id: randomUUID(),
    steps: [
      {
        id: randomUUID(),
        step_number: 0,
        tool_name: "tool1",
        parameters: {},
        dependencies: [],
        description: "Independent 1",
        requires_confirmation: false,
        timeout_ms: 5000
      },
      {
        id: randomUUID(),
        step_number: 1,
        tool_name: "tool2",
        parameters: {},
        dependencies: [],
        description: "Independent 2",
        requires_confirmation: false,
        timeout_ms: 5000
      }
    ],
    constraints: {
      max_steps: 10,
      max_total_tokens: 1000,
      max_execution_time_ms: 10000
    },
    metadata: {
      version: "1.0.0",
      created_at: new Date().toISOString(),
      planning_model_id: "test",
      estimated_total_tokens: 0,
      estimated_latency_ms: 0
    },
    summary: "Parallel test plan"
  };

  const startTime = Date.now();
  await executePlan(plan, mockToolExecutor, { persistState: false });
  const endTime = Date.now();
  const totalDuration = endTime - startTime;

  console.log(`Total duration: ${totalDuration}ms`);
  
  // tool1 and tool2 should run in parallel, so they should both finish around 1000ms.
  // If they ran serially, it would be 2000ms+.
  if (totalDuration < 1500) {
    console.log("PASS: Parallel Execution confirmed.");
  } else {
    console.error(`FAIL: Execution took too long (${totalDuration}ms), likely serial.`);
    process.exit(1);
  }
}

testParallelExecution().catch(err => {
  console.error(err);
  process.exit(1);
});
