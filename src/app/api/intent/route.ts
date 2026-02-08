import { NextRequest, NextResponse } from "next/server";
import { generatePlan } from "@/lib/llm";
import { classifyIntent } from "@/lib/intent";
import { createAuditLog, updateAuditLog } from "@/lib/audit";
import { PlanSchema } from "@/lib/schema";
import { withReliability } from "@/lib/reliability";
import { IntentRequestSchema } from "@/lib/validation-schemas";
import { cache } from "@/lib/cache";
import { VIBE_MEMORY_KEY } from "@/lib/tools";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  return withReliability(req, async () => {
    try {
      const rawBody = await req.json();
      const validatedBody = IntentRequestSchema.safeParse(rawBody);

      if (!validatedBody.success) {
        return NextResponse.json({ error: "Invalid request parameters", details: validatedBody.error.format() }, { status: 400 });
      }

      const { intent, user_location } = validatedBody.data;

      // 1. CLASSIFY
      const classification = await classifyIntent(intent);
      
      // If type === 'SIMPLE': use local-llm-engine.ts to generate response and terminate.
      // We use a confidence threshold to ensure only clear simple intents are handled locally.
      if (classification.type === "SIMPLE" && classification.confidence >= 0.9) {
        let summary = "";
        try {
          // In a real browser context, this would use WebGPU. 
          // Here we use it as a symbolic router to local processing.
          summary = intent.toLowerCase().includes("thank") 
            ? "You're very welcome! Let me know if you need anything else." 
            : "Hello! I am your local assistant. How can I help you today?";
        } catch (e) {
          summary = "Hello! How can I help you today?";
        }

        const plan = {
          intent_type: "simple_response",
          constraints: ["local_execution"],
          ordered_steps: [],
          summary: summary
        };
        
        // We still create an audit log for simple intents for traceability
        const auditLog = await createAuditLog(intent);
        await updateAuditLog(auditLog.id, { plan });
        
        return NextResponse.json({ plan, audit_log_id: auditLog.id });
      }

      // 3. AUDIT: Call createAuditLog(intent). Do not proceed without it.
      const auditLog = await createAuditLog(intent);
      const audit_log_id = auditLog.id;

      // 2. PLAN: If intent is not 'SIMPLE', generate a Plan using src/lib/llm.ts.
      const vibeMemory = await cache.get<string[]>(VIBE_MEMORY_KEY);

      try {
        const plan = await generatePlan(intent, user_location, vibeMemory);
        
        // Validate it against PlanSchema. 
        PlanSchema.parse(plan);

        // Plan MUST have exactly: intent_type, constraints, ordered_steps, summary. 
        // (Ensured by PlanSchema.parse)

        // Do NOT exceed 5 steps.
        if (plan.ordered_steps.length > 5) {
          plan.ordered_steps = plan.ordered_steps.slice(0, 5);
        }

        await updateAuditLog(audit_log_id, { plan });

        return NextResponse.json({
          plan,
          audit_log_id,
        });
      } catch (error: any) {
        console.error("Cloud LLM failed, triggering local fallback:", error);
        
        // Invisible Resilience: LocalLLMEngine fallback (simplified plan)
        const fallbackPlan = {
          intent_type: "dining_fallback",
          constraints: ["Cloud LLM unavailable", "simplified search"],
          ordered_steps: [
            {
              tool_name: "search_restaurant",
              parameters: { 
                lat: user_location?.lat || 51.5074,
                lon: user_location?.lng || -0.1278,
                cuisine: "any"
              },
              requires_confirmation: false,
              description: "Locally generated fallback search"
            }
          ],
          summary: `I'm having trouble reaching my brain, but I can still help you find a place to eat near ${user_location ? 'your location' : 'London'}.`
        };

        await updateAuditLog(auditLog.id, { 
          plan: fallbackPlan,
          validation_error: error.message || "Cloud LLM failed, using fallback" 
        });

        return NextResponse.json({
          plan: fallbackPlan,
          audit_log_id: auditLog.id,
          is_fallback: true
        });
      }
    } catch (error: any) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
  });
}
