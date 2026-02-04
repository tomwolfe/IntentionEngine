import { NextRequest, NextResponse } from 'next/server';
import { generatePlanFromIntent } from '@/lib/llm';
import { validatePlan } from '@/lib/validator';
import { Plan } from '@/types';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { intent } = body;

    if (!intent || typeof intent !== 'string') {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing or invalid intent parameter',
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    // Step 1: Call LLM to generate plan
    const reasoningResult = await generatePlanFromIntent(intent);

    if (!reasoningResult.success || !reasoningResult.plan) {
      return NextResponse.json(
        {
          success: false,
          error: reasoningResult.error || 'Failed to generate plan',
          raw_response: reasoningResult.rawResponse,
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      );
    }

    // Step 2: Validate the generated plan
    const validationResult = validatePlan(reasoningResult.plan);

    if (!validationResult.isValid) {
      return NextResponse.json(
        {
          success: false,
          error: 'Plan validation failed',
          validation_errors: validationResult.errors,
          raw_plan: reasoningResult.plan,
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    // Step 3: Return validated plan
    const validatedPlan = validationResult.plan as Plan;
    
    // Identify steps requiring confirmation
    const stepsRequiringConfirmation = validatedPlan.ordered_steps
      .filter(s => s.requires_confirmation)
      .map(s => ({
        step_id: s.step_id,
        step_number: s.step_number,
        description: s.description,
      }));

    return NextResponse.json({
      success: true,
      plan: validatedPlan,
      requires_confirmation: stepsRequiringConfirmation.length > 0,
      steps_requiring_confirmation: stepsRequiringConfirmation,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: `Internal server error: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}