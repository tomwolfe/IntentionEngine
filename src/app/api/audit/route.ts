import { NextRequest, NextResponse } from "next/server";
import { createAuditLog, updateAuditLog } from "@/lib/audit";
import { withReliability } from "@/lib/reliability";
import { AuditRequestSchema } from "@/lib/validation-schemas";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  return withReliability(req, async () => {
    try {
      const rawBody = await req.json();
      const validatedBody = AuditRequestSchema.safeParse(rawBody);

      if (!validatedBody.success) {
        return NextResponse.json({ error: "Invalid request parameters", details: validatedBody.error.format() }, { status: 400 });
      }

      const { intent, final_outcome } = validatedBody.data;

      const auditLog = await createAuditLog(intent);
      if (final_outcome) {
        await updateAuditLog(auditLog.id, { final_outcome });
      }

      return NextResponse.json({
        success: true,
        audit_log_id: auditLog.id,
      });
    } catch (error: any) {
      console.error("Audit log creation failed:", error);
      return NextResponse.json({ error: "Failed to create audit log" }, { status: 500 });
    }
  });
}
