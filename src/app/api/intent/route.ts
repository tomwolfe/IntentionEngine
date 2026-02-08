import { NextRequest, NextResponse } from "next/server";
import { generatePlan } from "@/lib/llm";
import { classifyIntent } from "@/lib/intent";
import { createAuditLog, updateAuditLog } from "@/lib/audit";
import { PlanSchema } from "@/lib/schema";
import { withReliability } from "@/lib/reliability";
import { IntentRequestSchema } from "@/lib/validation-schemas";
import { cache } from "@/lib/cache";

export const runtime = "edge";

const VIBE_MEMORY_KEY = "vibe_memory:special_cuisines";

export async function POST(req: NextRequest) {
  return withReliability(req, async () => {
    try {
      const rawBody = await req.json();
      const validatedBody = IntentRequestSchema.safeParse(rawBody);

      if (!validatedBody.success) {
        return NextResponse.json({ error: "Invalid request parameters", details: validatedBody.error.format() }, { status: 400 });
      }

      const { intent, user_location } = validatedBody.data;

      // Hybrid Regex-LLM Approach: Handle simple intents locally
      const classification = classifyIntent(intent);
      if (classification.type === "SIMPLE" && classification.confidence === 1.0) {
        const auditLog = await createAuditLog(intent);
        const plan = {
          intent_type: "simple_response",
          constraints: [],
          ordered_steps: [],
          summary: intent.toLowerCase().includes("thank") 
            ? "You're very welcome! Let me know if you need anything else." 
            : "Hello! How can I help you today with restaurant searches or calendar events?"
        };
        await updateAuditLog(auditLog.id, { plan });
        return NextResponse.json({ plan, audit_log_id: auditLog.id });
      }

      const auditLog = await createAuditLog(intent);
      const vibeMemory = await cache.get<string>(VIBE_MEMORY_KEY);

      try {
        const plan = await generatePlan(intent, user_location, vibeMemory);
        
        // Secondary validation just in case
        PlanSchema.parse(plan);

        await updateAuditLog(auditLog.id, { plan });

        return NextResponse.json({
          plan,
          audit_log_id: auditLog.id,
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
                location: "London",
                cuisine: "any"
              },
              requires_confirmation: false,
              description: "Locally generated fallback search"
            }
          ],
          summary: "I'm having trouble reaching my brain, but I can still help you find a place to eat in London."
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
