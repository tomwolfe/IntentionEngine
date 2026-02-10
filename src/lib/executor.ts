import { executeTool } from "./tools";
import { Step } from "./schema";

export interface ExecutionResult {
  step: Step;
  success: boolean;
  result?: any;
  error?: string;
}

export async function executeStep(step: Step): Promise<ExecutionResult> {
  try {
    const response = await executeTool(step.tool_name, step.parameters);
    return {
      step,
      success: response.success,
      result: response.result,
      error: response.error,
    };
  } catch (error: any) {
    return {
      step,
      success: false,
      error: error.message || "Unknown error during tool execution",
    };
  }
}

// Future: multi-step execution with data propagation could go here
