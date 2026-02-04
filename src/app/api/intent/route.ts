import { NextRequest, NextResponse } from "next/server";
import { generatePlan } from "@/lib/llm";
import { createAuditLog, updateAuditLog } from "@/lib/audit";
import { PlanSchema } from "@/lib/schema";

export async function POST(req: NextRequest) {
  try {
    const { intent, user_location } = await req.json();

    if (!intent) {
      return NextResponse.json({ error: "Intent is required" }, { status: 400 });
    }

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
}
