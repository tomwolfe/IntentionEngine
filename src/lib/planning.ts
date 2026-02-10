import { z } from "zod";

export interface PlanStep {
  tool_name: string;
  parameters: any;
  depends_on?: number[]; // indices of steps this step depends on
}

export interface Plan {
  id: string;
  ordered_steps: PlanStep[];
}

export function validatePlan(plan: Plan) {
  if (plan.ordered_steps.length === 0) {
    throw new Error('Plan must have at least one step');
  }

  let hasRestaurantSearch = false;
  let hasCalendarEvent = false;
  
  for (const step of plan.ordered_steps) {
    if (step.tool_name === 'search_restaurant') {
      hasRestaurantSearch = true;
    }
    if (step.tool_name === 'add_calendar_event') {
      hasCalendarEvent = true;
    }
  }

  if (hasCalendarEvent && !hasRestaurantSearch) {
    // This is a business logic validation: we usually want to search for a restaurant before scheduling it.
    // Of course, the user might provide the restaurant details directly, so this is just an example.
    console.warn('Calendar event creation without prior restaurant search detected');
  }

  // Check for circular dependencies
  // ... (implementation of cycle detection if needed)
}

export function optimizePlan(plan: Plan): Plan {
  // Example optimization: remove redundant geocode calls if the location is the same
  const optimizedSteps: PlanStep[] = [];
  const geocodeMap = new Map<string, number>();

  for (const step of plan.ordered_steps) {
    if (step.tool_name === 'geocode_location') {
      const loc = step.parameters.location;
      if (geocodeMap.has(loc)) {
        continue; // Skip redundant geocode
      }
      geocodeMap.set(loc, optimizedSteps.length);
    }
    optimizedSteps.push(step);
  }

  return { ...plan, ordered_steps: optimizedSteps };
}

export async function simulatePlan(plan: Plan) {
  console.log(`Simulating plan ${plan.id}...`);
  const results = [];
  for (const step of plan.ordered_steps) {
    results.push({
      tool_name: step.tool_name,
      status: "simulated_success",
      estimated_latency: "100ms",
    });
  }
  return results;
}
