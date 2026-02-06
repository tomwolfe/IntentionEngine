import { NextRequest, NextResponse } from "next/server";
import { generatePlan } from "@/lib/llm";
import { createAuditLog, updateAuditLog } from "@/lib/audit";
import { PlanSchema } from "@/lib/schema";
import { withReliability } from "@/lib/reliability";
import { IntentRequestSchema } from "@/lib/validation-schemas";

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

      const auditLog = await createAuditLog(intent);

      try {
        const plan = await generatePlan(intent, user_location);
        
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
