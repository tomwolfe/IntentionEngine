import { getAuditLog } from "@/lib/audit";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = params.id;

  if (!id) {
    return NextResponse.json({ error: "Missing audit ID" }, { status: 400 });
  }

  try {
    const log = await getAuditLog(id);

    if (!log) {
      return NextResponse.json({ error: "Audit log not found" }, { status: 404 });
    }

    return NextResponse.json(log);
  } catch (error: any) {
    console.error(`Error fetching audit log ${id}:`, error);
    return NextResponse.json({ error: "Failed to fetch audit log" }, { status: 500 });
  }
}
