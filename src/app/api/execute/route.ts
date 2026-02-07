import { NextRequest, NextResponse } from "next/server";
import { getAuditLog, updateAuditLog, AuditLog } from "@/lib/audit";
import { executeTool } from "@/lib/tools";
import { withReliability } from "@/lib/reliability";
import { ExecuteRequestSchema } from "@/lib/validation-schemas";

export const runtime = "edge";

async function processIntentionLoop(log: AuditLog, startStep: number) {
  if (!log.plan) return;

  const results: Record<string, any> = {};
  // Hydrate results from previous steps
  log.steps.forEach(s => {
    if (s.status === "executed") {
      results[s.tool_name] = s.output;
    }
  });

  for (let i = startStep; i < log.plan.ordered_steps.length; i++) {
    const step = log.plan.ordered_steps[i];
    
    // Resolve parameters from previous results
    const params = { ...step.parameters };
    Object.keys(params).forEach(key => {
      if (typeof params[key] === 'string' && params[key].includes('[') && params[key].includes(']')) {
        // Simple heuristic for tool chaining
        if (params[key].includes('[Restaurant]')) {
          const searchResult = results['search_restaurant'];
          if (searchResult && searchResult.success && searchResult.result && searchResult.result.length > 0) {
            const top = searchResult.result[0];
            if (key === 'title') params[key] = params[key].replace('[Restaurant]', top.name);
            if (key === 'restaurant_name') params[key] = top.name;
            if (key === 'restaurant_address') params[key] = top.address;
            if (key === 'location') params[key] = top.address;
          }
        }
      }
    });

    try {
      let result = await executeTool(step.tool_name, {
        ...params,
        isSpecialIntent: log.plan.is_special
      });
      
      // Silent Fallback Logic
      if (step.tool_name === 'search_restaurant' && (!result.success || !result.result || result.result.length === 0)) {
        console.warn(`Tool ${step.tool_name} failed or returned no results. Trying fallback...`);
        // Fallback: broaden the search (remove cuisine, broaden area)
        const fallbackParams = { ...params, cuisine: undefined, location: 'London' }; 
        result = await executeTool(step.tool_name, {
          ...fallbackParams,
          isSpecialIntent: log.plan.is_special
        });
      }

      const stepLog = {
        step_index: i,
        tool_name: step.tool_name,
        status: "executed" as const,
        input: params,
        output: result,
        confirmed_by_user: true,
      };

      results[step.tool_name] = result;
      
      const existingSteps = (await getAuditLog(log.id))?.steps || [];
      const updatedSteps = [...existingSteps.filter(s => s.step_index !== i), stepLog];
      await updateAuditLog(log.id, { steps: updatedSteps });

      if (updatedSteps.length === log.plan.ordered_steps.length) {
        await updateAuditLog(log.id, { 
          final_outcome: {
            status: "SUCCESS",
            message: "All steps executed autonomously.",
            restaurant: results['search_restaurant']?.result?.[0],
            calendar_event_url: results['add_calendar_event']?.result?.download_url,
            wine_suggestion: results['search_restaurant']?.result?.[0]?.suggested_wine
          }
        });
      }

      // If the next step requires confirmation and we're not in a special (autonomous) mode, stop the loop.
      const nextStep = log.plan.ordered_steps[i + 1];
      if (nextStep && nextStep.requires_confirmation && !log.plan.is_special) {
        break;
      }
    } catch (error: any) {
      // Silent fallback: if a tool fails, we try to mark it and potentially continue if there's a fallback strategy
      // For now, we'll mark it as failed and stop.
      const stepLog = {
        step_index: i,
        tool_name: step.tool_name,
        status: "failed" as const,
        input: params,
        error: error.message,
      };
      const existingSteps = (await getAuditLog(log.id))?.steps || [];
      const updatedSteps = [...existingSteps.filter(s => s.step_index !== i), stepLog];
      await updateAuditLog(log.id, { steps: updatedSteps, final_outcome: "Failed: Execution error." });
      break;
    }
  }
}

export async function POST(req: NextRequest) {
  return withReliability(req, async () => {
    try {
      const rawBody = await req.json();
      const validatedBody = ExecuteRequestSchema.safeParse(rawBody);

      if (!validatedBody.success) {
        return NextResponse.json({ error: "Invalid request parameters", details: validatedBody.error.format() }, { status: 400 });
      }

      const { audit_log_id, step_index, user_confirmed } = validatedBody.data;

      const log = await getAuditLog(audit_log_id);
      if (!log || !log.plan) {
        return NextResponse.json({ error: "Audit log or plan not found" }, { status: 404 });
      }

      const step = log.plan.ordered_steps[step_index];
      if (!step) {
        return NextResponse.json({ error: "Step not found" }, { status: 404 });
      }

      // Check if already executed
      const existingStepLog = log.steps.find(s => s.step_index === step_index);
      if (existingStepLog && existingStepLog.status === "executed") {
        return NextResponse.json({ error: "Step already executed" }, { status: 400 });
      }

      if (step.requires_confirmation && !user_confirmed && !log.plan.is_special) {
        return NextResponse.json({ error: "User confirmation required for this step" }, { status: 403 });
      }

      // Start the autonomous loop
      await processIntentionLoop(log, step_index);

      const finalLog = await getAuditLog(audit_log_id);
      const currentStepLog = finalLog?.steps.find(s => s.step_index === step_index);
      
      if (currentStepLog?.status === "failed") {
        return NextResponse.json({ 
          error: currentStepLog.error || "Execution failed"
        }, { status: 500 });
      }

      return NextResponse.json({ 
        result: currentStepLog?.output, 
        audit_log_id
      });
    } catch (error: any) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
  });
}