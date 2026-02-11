import { Intent } from "./schema";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface CapabilityGuardrail {
  capability: string;
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  description: string;
}

const CAPABILITY_GUARDRAILS: Record<string, CapabilityGuardrail> = {
  "calendar.create": {
    capability: "calendar.create",
    riskLevel: "LOW",
    requiresConfirmation: false,
    description: "Creating a calendar event."
  },
  "calendar.delete": {
    capability: "calendar.delete",
    riskLevel: "HIGH",
    requiresConfirmation: true,
    description: "Deleting a calendar event."
  },
  "email.send": {
    capability: "email.send",
    riskLevel: "MEDIUM",
    requiresConfirmation: true,
    description: "Sending an email."
  },
  "mobility_request": {
    capability: "mobility_request",
    riskLevel: "HIGH",
    requiresConfirmation: true,
    description: "Requesting a ride via Uber or Tesla."
  },
  "reserve_table": {
    capability: "reserve_table",
    riskLevel: "HIGH",
    requiresConfirmation: true,
    description: "Finalizing a restaurant reservation."
  },
  "send_comm": {
    capability: "send_comm",
    riskLevel: "MEDIUM",
    requiresConfirmation: true,
    description: "Sending a communication (Email/SMS)."
  },
  "get_weather": {
    capability: "get_weather",
    riskLevel: "LOW",
    requiresConfirmation: false,
    description: "Fetching weather information."
  },
  "get_route_estimate": {
    capability: "get_route_estimate",
    riskLevel: "LOW",
    requiresConfirmation: false,
    description: "Calculating travel time and distance."
  }
};

/**
 * Checks if an intent violates safety guardrails or requires confirmation.
 */
export function checkGuardrails(intent: Intent): { 
  allowed: boolean; 
  requiresConfirmation: boolean; 
  reason?: string; 
} {
  if (intent.type !== "ACTION" && intent.type !== "SCHEDULE") {
    return { allowed: true, requiresConfirmation: false };
  }

  const capability = intent.parameters.capability || intent.parameters.tool_name;
  const guardrail = CAPABILITY_GUARDRAILS[capability];

  if (!guardrail) {
    // If it's a known tool but not in guardrails, default to safe but cautious
    return { 
      allowed: true, 
      requiresConfirmation: true, 
      reason: `Capability ${capability} has no defined guardrail, requiring confirmation by default.` 
    };
  }

  // If the intent is HIGH risk, it must be explicitly confirmed.
  // We check the intent confidence as a proxy for 'explicit confirmation' in the first pass
  // but the execution layer handles the user_confirmed flag.
  if (guardrail.riskLevel === "HIGH" && intent.confidence < 0.9) {
    return {
      allowed: false,
      requiresConfirmation: true,
      reason: `HIGH risk action ${capability} requires higher confidence or explicit user confirmation.`
    };
  }

  return {
    allowed: true,
    requiresConfirmation: guardrail.requiresConfirmation,
    reason: guardrail.description
  };
}
