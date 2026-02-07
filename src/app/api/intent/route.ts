import { NextRequest, NextResponse } from "next/server";
import { generatePlan } from "@/lib/llm";
import { classifyIntent } from "@/lib/intent";
import { createAuditLog, updateAuditLog } from "@/lib/audit";
import { PlanSchema } from "@/lib/schema";
import { withReliability } from "@/lib/reliability";
import { IntentRequestSchema } from "@/lib/validation-schemas";
import { getPersonalPreferences } from "@/lib/vibe-memory";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  return withReliability(req, async () => {
    try {
      const rawBody = await req.json();
      const validatedBody = IntentRequestSchema.safeParse(rawBody);

      if (!validatedBody.success) {
        return NextResponse.json({ error: "Invalid request parameters", details: validatedBody.error.format() }, { status: 400 });
      }

      const { intent, user_location, user_id } = validatedBody.data;

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

      try {
        const preferences = await getPersonalPreferences(user_id);
        const plan = await generatePlan(intent, user_location, preferences);
        
        // Secondary validation just in case
        PlanSchema.parse(plan);

        await updateAuditLog(auditLog.id, { plan });

        return NextResponse.json({
          plan,
          audit_log_id: auditLog.id,
        });
      } catch (error: any) {
        console.error("Plan generation failed:", error);
        await updateAuditLog(auditLog.id, { 
          validation_error: error.message || "Unknown error during plan generation" 
        });
        return NextResponse.json({ 
          error: "Failed to generate execution plan", 
          details: error.message,
          audit_log_id: auditLog.id 
        }, { status: 500 });
      }
    } catch (error: any) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
  });
}
