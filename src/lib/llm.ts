/**
 * LLM Reasoning Engine
 * Converts natural language intent to structured JSON plan
 * STRICT: Output must be valid JSON conforming to PlanSchema
 * NO free text, NO explanations, NO markdown
 */

import { Plan, PlanStep, PlanSchema } from '@/types';
import { v4 as uuidv4 } from 'uuid';

const LLM_API_URL = process.env.GLM_API_URL || 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const LLM_API_KEY = process.env.GLM_API_KEY || '';

// System prompt that enforces strict JSON-only output
const SYSTEM_PROMPT = `You are a deterministic plan generator. Your ONLY output must be valid JSON conforming to this EXACT schema:

{
  "plan_id": "uuid",
  "intent_type": "plan_meeting|schedule_event|modify_event|find_information|send_message|create_reminder",
  "intent_summary": "max 200 chars description",
  "constraints": {
    "time_constraints": ["string array"],
    "location_constraints": ["string array"],
    "participant_constraints": ["string array"],
    "budget_constraints": ["string array"]
  },
  "ordered_steps": [
    {
      "step_id": "uuid",
      "step_number": 1,
      "tool_name": "google_calendar_find_slots|validate_time_constraint|google_calendar_create_event|send_confirmation_notification|generate_deep_link|wait_for_user_input",
      "parameters": {},
      "requires_confirmation": true|false,
      "description": "max 500 chars",
      "expected_outcome": "max 500 chars"
    }
  ],
  "fallback_actions": [
    {
      "condition": "string",
      "action": "string"
    }
  ],
  "created_at": "ISO8601 timestamp",
  "expires_at": "ISO8601 timestamp (optional)"
}

CRITICAL RULES:
1. Output ONLY valid JSON. NO markdown code blocks. NO explanations before or after.
2. Every field must be present and correctly typed.
3. tool_name MUST be from the allowed list ONLY.
4. Any action that creates/modifies external state MUST have requires_confirmation: true.
5. steps must be numbered sequentially starting from 1.
6. Use RFC4122 UUID v4 format for all IDs.
7. created_at must be current ISO8601 timestamp.

ALLOWED TOOLS (use EXACTLY these names):
- google_calendar_find_slots: Find available time slots
- validate_time_constraint: Check if time meets constraints
- google_calendar_create_event: Create calendar event (REQUIRES confirmation)
- send_confirmation_notification: Send confirmation (REQUIRES confirmation)
- generate_deep_link: Generate app deep links (Uber, OpenTable, etc.)
- wait_for_user_input: Pause for user confirmation

EXAMPLE INPUT: "Plan dinner with Sarah tomorrow at 7pm"
EXAMPLE OUTPUT:
{"plan_id":"550e8400-e29b-41d4-a716-446655440000","intent_type":"plan_meeting","intent_summary":"Schedule dinner with Sarah tomorrow evening","constraints":{"time_constraints":["tomorrow at 7pm"],"participant_constraints":["Sarah"],"location_constraints":["dinner"]},"ordered_steps":[{"step_id":"550e8400-e29b-41d4-a716-446655440001","step_number":1,"tool_name":"google_calendar_find_slots","parameters":{"date":"tomorrow","time":"19:00","duration_minutes":120},"requires_confirmation":false,"description":"Find available time slot for dinner","expected_outcome":"List of available slots or conflicts"},{"step_id":"550e8400-e29b-41d4-a716-446655440002","step_number":2,"tool_name":"validate_time_constraint","parameters":{"time":"19:00","date":"tomorrow"},"requires_confirmation":false,"description":"Validate dinner time constraints","expected_outcome":"Time is within acceptable range"},{"step_id":"550e8400-e29b-41d4-a716-446655440003","step_number":3,"tool_name":"google_calendar_create_event","parameters":{"title":"Dinner with Sarah","date":"tomorrow","time":"19:00","duration_minutes":120},"requires_confirmation":true,"description":"Create calendar event for dinner","expected_outcome":"Calendar event created with confirmation"},{"step_id":"550e8400-e29b-41d4-a716-446655440004","step_number":4,"tool_name":"generate_deep_link","parameters":{"service":"opentable","action":"find_restaurants","time":"19:00"},"requires_confirmation":false,"description":"Generate OpenTable deep link","expected_outcome":"Deep link to find restaurants"}],"fallback_actions":[{"condition":"No time slots available","action":"Suggest alternative times"}],"created_at":"2024-01-15T19:00:00.000Z"}

REMEMBER: NO TEXT BEFORE OR AFTER JSON. NO MARKDOWN. JUST RAW JSON.`;

export interface ReasoningResult {
  success: boolean;
  plan?: Plan;
  rawResponse?: string;
  error?: string;
}

/**
 * Calls GLM-4.7-flash to generate a structured plan from natural language intent
 * This is the ONLY place where LLM reasoning occurs
 */
export async function generatePlanFromIntent(intent: string): Promise<ReasoningResult> {
  try {
    if (!LLM_API_KEY) {
      // Fallback to deterministic template-based generation if no API key
      return generateFallbackPlan(intent);
    }

    const response = await fetch(LLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'glm-4-flash',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: intent },
        ],
        temperature: 0.1, // Low temperature for determinism
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;

    if (!rawContent) {
      return {
        success: false,
        error: 'LLM returned empty response',
      };
    }

    // Extract JSON from response (handle potential markdown code blocks)
    let jsonContent = rawContent;
    
    // Remove markdown code blocks if present
    const codeBlockMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonContent = codeBlockMatch[1];
    }

    // Clean up any leading/trailing whitespace or text
    jsonContent = jsonContent.trim();
    
    // Find JSON object boundaries
    const firstBrace = jsonContent.indexOf('{');
    const lastBrace = jsonContent.lastIndexOf('}');
    
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return {
        success: false,
        rawResponse: rawContent,
        error: 'Could not find valid JSON object in LLM response',
      };
    }

    jsonContent = jsonContent.substring(firstBrace, lastBrace + 1);

    // Parse the JSON
    let parsedPlan: unknown;
    try {
      parsedPlan = JSON.parse(jsonContent);
    } catch (parseError) {
      return {
        success: false,
        rawResponse: rawContent,
        error: `JSON parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
      };
    }

    return {
      success: true,
      plan: parsedPlan as Plan,
      rawResponse: rawContent,
    };

  } catch (error) {
    // Fallback to deterministic template generation on any error
    console.error('LLM API error, using fallback:', error);
    return generateFallbackPlan(intent);
  }
}

/**
 * Fallback deterministic plan generator (when LLM is unavailable)
 * Uses pattern matching to generate valid plans
 * This ensures the system is always deterministic and auditable
 */
function generateFallbackPlan(intent: string): ReasoningResult {
  const normalizedIntent = intent.toLowerCase().trim();
  const planId = uuidv4();
  const now = new Date();
  const createdAt = now.toISOString();

  // Parse intent for dinner planning pattern
  const isDinnerPlan = normalizedIntent.includes('dinner') || 
                       normalizedIntent.includes('lunch') || 
                       normalizedIntent.includes('brunch') ||
                       normalizedIntent.includes('meal');
  
  const hasPerson = normalizedIntent.match(/with\s+(\w+)/i);
  const hasTime = normalizedIntent.match(/(tomorrow|today|next\s+\w+|at\s+\d{1,2}(:\d{2})?\s*(am|pm)?)/i);
  const hasAddToCalendar = normalizedIntent.includes('calendar') || 
                           normalizedIntent.includes('schedule');

  const steps: PlanStep[] = [];
  let stepNum = 1;

  // Step 1: Parse constraints
  steps.push({
    step_id: uuidv4(),
    step_number: stepNum++,
    tool_name: 'validate_time_constraint',
    parameters: {
      extracted_time: hasTime ? hasTime[0] : 'tomorrow',
      intent: normalizedIntent,
    },
    requires_confirmation: false,
    description: 'Parse and validate time constraints from intent',
    expected_outcome: 'Time constraints extracted and validated',
  });

  // Step 2: Find calendar slots (if calendar mentioned)
  if (hasAddToCalendar) {
    steps.push({
      step_id: uuidv4(),
      step_number: stepNum++,
      tool_name: 'google_calendar_find_slots',
      parameters: {
        time_hint: hasTime ? hasTime[0] : 'tomorrow',
        duration_minutes: 120,
      },
      requires_confirmation: false,
      description: 'Find available calendar slots for the meal',
      expected_outcome: 'Available time slots identified',
    });

    // Step 3: Create calendar event (REQUIRES confirmation)
    steps.push({
      step_id: uuidv4(),
      step_number: stepNum++,
      tool_name: 'google_calendar_create_event',
      parameters: {
        title: hasPerson ? `Dinner with ${hasPerson[1]}` : 'Dinner',
        description: `Planned via Intention Engine: ${intent}`,
        time_hint: hasTime ? hasTime[0] : 'tomorrow',
        duration_minutes: 120,
      },
      requires_confirmation: true,
      description: 'Create calendar event for the dinner',
      expected_outcome: 'Calendar event created pending user confirmation',
    });
  }

  // Step 4: Generate deep link for restaurant booking
  if (isDinnerPlan) {
    steps.push({
      step_id: uuidv4(),
      step_number: stepNum++,
      tool_name: 'generate_deep_link',
      parameters: {
        service: 'opentable',
        action: 'search',
        time_hint: hasTime ? hasTime[0] : 'tomorrow',
      },
      requires_confirmation: false,
      description: 'Generate OpenTable deep link for restaurant reservations',
      expected_outcome: 'Deep link generated for restaurant search',
    });
  }

  const plan: Plan = {
    plan_id: planId,
    intent_type: isDinnerPlan ? 'plan_meeting' : 'schedule_event',
    intent_summary: intent.slice(0, 200),
    constraints: {
      time_constraints: hasTime ? [hasTime[0]] : [],
      participant_constraints: hasPerson ? [hasPerson[1]] : [],
      location_constraints: isDinnerPlan ? ['restaurant'] : [],
    },
    ordered_steps: steps,
    fallback_actions: [
      {
        condition: 'No time slots available',
        action: 'Suggest alternative times to user',
      },
      {
        condition: 'Calendar conflict detected',
        action: 'Notify user of conflict and ask for resolution',
      },
    ],
    created_at: createdAt,
    expires_at: new Date(now.getTime() + 60 * 60 * 1000).toISOString(), // 1 hour expiry
  };

  return {
    success: true,
    plan,
    rawResponse: JSON.stringify(plan),
  };
}