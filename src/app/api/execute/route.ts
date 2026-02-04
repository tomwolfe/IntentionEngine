import { NextRequest, NextResponse } from 'next/server';
import { executePlan } from '@/lib/executor';
import { initAuditLog, logValidationResult, logFinalOutcome } from '@/lib/audit';
import { Plan, AuditLog } from '@/types';

export const runtime = 'edge';

export interface ExecuteRequest {
  plan: Plan;
  confirmations?: Record<string, boolean>; // step_id -> confirmed
  external_tokens?: {
    google_calendar?: string;
  };
}

export interface ExecuteResponse {
  success: boolean;
  execution_id: string;
  status: 'success' | 'partial_success' | 'failed' | 'rejected';
  summary: string;
  step_results: Array<{
    step_id: string;
    step_number: number;
    status: string;
    result?: unknown;
    error?: string;
    requires_confirmation?: boolean;
  }>;
  outputs?: Record<string, unknown>;
  audit_log_id: string;
  pending_confirmations?: Array<{
    step_id: string;
    step_number: number;
    description: string;
  }>;
}

export async function POST(request: NextRequest) {
  const executionStartTime = Date.now();
  
  try {
    const body: ExecuteRequest = await request.json();
    const { plan, confirmations = {}, external_tokens } = body;

    // Validate request
    if (!plan || !plan.plan_id) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing or invalid plan',
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    // Initialize audit log
    const executionId = crypto.randomUUID();
    initAuditLog(
      executionId,
      plan.plan_id,
      'Execute endpoint called with validated plan',
      plan
    );

    // Convert confirmations to Map
    const confirmationMap = new Map<string, boolean>(
      Object.entries(confirmations)
    );

    // Execute the plan (convert snake_case to camelCase)
    const executionResult = await executePlan(
      plan,
      confirmationMap,
      external_tokens ? {
        googleCalendar: external_tokens.google_calendar,
      } : undefined
    );

    // Map step results to response format
    const stepResults = executionResult.stepResults.map(sr => {
      const planStep = plan.ordered_steps.find(s => s.step_id === sr.stepId);
      return {
        step_id: sr.stepId,
        step_number: sr.stepNumber,
        status: sr.status,
        result: sr.result,
        error: sr.error,
        requires_confirmation: planStep?.requires_confirmation ?? false,
      };
    });

    // Identify pending confirmations
    const pendingConfirmations = stepResults
      .filter(sr => sr.status === 'pending_confirmation')
      .map(sr => {
        const planStep = plan.ordered_steps.find(s => s.step_id === sr.step_id);
        return {
          step_id: sr.step_id,
          step_number: sr.step_number,
          description: planStep?.description || 'Unknown step',
        };
      });

    // Log final outcome
    logFinalOutcome(
      executionId,
      executionResult.status,
      executionResult.summary,
      executionResult.outputs
    );

    const response: ExecuteResponse = {
      success: executionResult.status === 'success',
      execution_id: executionId,
      status: executionResult.status,
      summary: executionResult.summary,
      step_results: stepResults,
      outputs: executionResult.outputs,
      audit_log_id: executionId,
    };

    // Add pending confirmations if any
    if (pendingConfirmations.length > 0) {
      response.pending_confirmations = pendingConfirmations;
    }

    return NextResponse.json(response);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return NextResponse.json(
      {
        success: false,
        error: `Execution failed: ${errorMessage}`,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}