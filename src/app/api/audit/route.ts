import { NextRequest, NextResponse } from "next/server";
import { getUserAuditLogs } from "@/lib/audit";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const userIp = req.headers.get("x-forwarded-for") || "anonymous";
  
  try {
    const logs = await getUserAuditLogs(userIp, 10);
    return NextResponse.json({ logs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
