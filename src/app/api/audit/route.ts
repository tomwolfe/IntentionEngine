import { NextRequest, NextResponse } from 'next/server';
import { getAuditLog, serializeAuditLog, replayExecution, verifyReproducibility } from '@/lib/audit';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const executionId = searchParams.get('id');

  if (!executionId) {
    return NextResponse.json(
      {
        success: false,
        error: 'Missing execution ID parameter',
      },
      { status: 400 }
    );
  }

  try {
    const auditLog = getAuditLog(executionId);

    if (!auditLog) {
      return NextResponse.json(
        {
          success: false,
          error: `Audit log not found: ${executionId}`,
        },
        { status: 404 }
      );
    }

    // Calculate reproducibility
    const reproducibility = verifyReproducibility(executionId);
    const replayInfo = replayExecution(executionId);

    return NextResponse.json({
      success: true,
      audit_log: auditLog,
      metadata: {
        can_replay: replayInfo.canReplay,
        is_reproducible: reproducibility.isReproducible,
        reproducibility_notes: reproducibility.reasons,
      },
    });

  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: `Failed to retrieve audit log: ${error instanceof Error ? error.message : String(error)}`,
      },
      { status: 500 }
    );
  }
}