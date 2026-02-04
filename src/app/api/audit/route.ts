import { NextRequest, NextResponse } from "next/server";
import { createAuditLog, updateAuditLog } from "@/lib/audit";
import { z } from "zod";

export const runtime = "edge";

const AuditRequestSchema = z.object({
  intent: z.string().min(1),
  final_outcome: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const validatedBody = AuditRequestSchema.safeParse(rawBody);

    if (!validatedBody.success) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
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
}
