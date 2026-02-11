import { Intent, Step } from "./schema";
import { checkGuardrails } from "./guardrails";

export interface ExecutionPlan {
  intent_id: string;
  steps: Step[];
  requires_total_confirmation: boolean;
  dry_run: boolean;
}

/**
 * Transforms a validated Intent into a structured Execution Plan.
 */
export function createExecutionPlan(intent: Intent, dryRun: boolean = true): ExecutionPlan {
  const guardrail = checkGuardrails(intent);

  if (!guardrail.allowed) {
    throw new Error(`Execution blocked by guardrails: ${guardrail.reason}`);
  }

  const steps: Step[] = [];

  // Mapping logic based on Intent Type
  if (intent.type === "ACTION") {
    const toolName = intent.parameters.capability || intent.parameters.tool_name;
    steps.push({
      tool_name: toolName,
      parameters: intent.parameters.arguments || intent.parameters,
      requires_confirmation: guardrail.requiresConfirmation,
      description: guardrail.reason || `Execute ${toolName}`
    });
  } else if (intent.type === "SCHEDULE") {
    const isDinner = intent.rawText.toLowerCase().includes("dinner") || 
                     (intent.parameters.title && intent.parameters.title.toLowerCase().includes("dinner"));

    if (isDinner) {
      // Special logic for dinner: add route estimate
      steps.push({
        tool_name: "get_route_estimate",
        parameters: {
          origin: "current_location",
          destination: intent.parameters.location || intent.parameters.restaurant_address || "the restaurant",
          travel_mode: "driving"
        },
        requires_confirmation: false,
        description: "Calculate travel time for dinner"
      });
    }

    steps.push({
      tool_name: "add_calendar_event",
      parameters: {
        events: [{
          title: intent.parameters.title || "New Event",
          start_time: intent.parameters.start_time || intent.parameters.temporal_expression,
          end_time: intent.parameters.end_time,
          location: intent.parameters.location || intent.parameters.restaurant_address,
          restaurant_name: intent.parameters.restaurant_name
        }]
      },
      requires_confirmation: guardrail.requiresConfirmation,
      description: isDinner ? "Schedule dinner and adjust for travel" : "Schedule event"
    });
  }

  // Transactional intents (high risk) trigger total confirmation
  const isTransactional = steps.some(s => 
    ["mobility_request", "reserve_table"].includes(s.tool_name)
  );

  return {
    intent_id: intent.id,
    steps,
    requires_total_confirmation: guardrail.requiresConfirmation || isTransactional,
    dry_run: dryRun
  };
}
