import { Intent, Plan, PlanConstraints, ToolDefinition } from "./types";
import { generatePlan, PlannerResult, PlannerContext } from "./planner";
import { generateStructured } from "./llm";

/**
 * PlanRepairMiddleware wraps the planner with resilience logic.
 * If the initial plan generation fails validation (ZodError),
 * it retries once by providing the error message back to the LLM.
 */
export async function generatePlanWithRepair(
  intent: Intent,
  context: PlannerContext = {}
): Promise<PlannerResult> {
  try {
    // Attempt 1: Normal generation
    return await generatePlan(intent, context);
  } catch (error: any) {
    // Check if it's a validation error
    const isValidationError = 
      error.code === "PLAN_VALIDATION_FAILED" || 
      error.code === "LLM_SCHEMA_VALIDATION_FAILED";

    if (!isValidationError) {
      throw error; // Re-throw if it's not a validation error
    }

    console.warn(`Plan validation failed. Attempting repair... Error: ${error.message}`);

    // Attempt 2: Repair generation with error feedback
    const repairPrompt = `The previous plan generation failed validation with the following error:
${error.message}
${error.details ? `Details: ${JSON.stringify(error.details)}` : ""}

Please correct the plan and ensure it strictly follows the schema and constraints.
Original Intent: ${intent.raw_input}
Parameters: ${JSON.stringify(intent.parameters)}`;

    // We call generatePlan again but we need a way to pass the repair prompt.
    // Since generatePlan builds its own prompt, we might need to modify generatePlan
    // to accept an optional additional instructions or just implement the repair logic here
    // using generateStructured directly.
    
    // For simplicity and to follow the requirement "resend the error string + the original prompt",
    // I'll modify generatePlan in planner.ts to accept an optional 'repairFeedback'.
    
    return await generatePlan(intent, {
      ...context,
      repairFeedback: repairPrompt
    });
  }
}
