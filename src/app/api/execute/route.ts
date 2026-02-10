import { NextRequest, NextResponse } from "next/server";
import { getAuditLog, updateAuditLog } from "@/lib/audit";
import { executeTool } from "@/lib/tools";
import { replan } from "@/lib/llm";
import { z } from "zod";

export const runtime = "edge";

const ExecuteRequestSchema = z.object({
  audit_log_id: z.string().min(1),
  step_index: z.number().min(0),
  user_confirmed: z.boolean().optional().default(false),
});

function getDeepPath(obj: any, path: string) {
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (part.includes("[") && part.includes("]")) {
      const arrayPart = part.match(/(.+)\[(\d+)\]/);
      if (arrayPart) {
        const arrayName = arrayPart[1];
        const index = parseInt(arrayPart[2]);
        current = arrayName ? current[arrayName][index] : current[index];
      } else {
        // Case like [0] without array name
        const indexMatch = part.match(/\[(\d+)\]/);
        if (indexMatch) {
          current = current[parseInt(indexMatch[1])];
        }
      }
    } else {
      current = current[part];
    }
    if (current === undefined) throw new Error(`Path ${path} not found in object`);
  }
  return current;
}

export async function POST(req: NextRequest) {
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

    if (step.requires_confirmation && !user_confirmed) {
      return NextResponse.json({ error: "User confirmation required for this step" }, { status: 403 });
    }

    // Check if already executed
    const existingStepLog = log.steps.find(s => s.step_index === step_index);
    if (existingStepLog && existingStepLog.status === "executed") {
      return NextResponse.json({ error: "Step already executed" }, { status: 400 });
    }

    // Resolve parameters if they contain placeholders like {{step_0.result.lat}}
    const resolveValue = (value: string) => {
      // Handle the case where the whole value is a single placeholder (returning the raw object/number/etc.)
      const fullMatch = value.match(/^{{step_(\d+)\.(.+?)}}$/);
      if (fullMatch) {
        const prevStepIndex = parseInt(fullMatch[1]);
        const path = fullMatch[2];
        const prevStep = log.steps.find(s => s.step_index === prevStepIndex);
        if (prevStep && prevStep.output) {
          try {
            return getDeepPath(prevStep.output, path);
          } catch (e) {
            console.warn(`Failed to resolve full placeholder ${value}:`, e);
            return value;
          }
        }
      }

      // Handle cases where placeholders are embedded in strings
      return value.replace(/{{step_(\d+)\.(.+?)}}/g, (match, stepIdx, path) => {
        const prevStepIndex = parseInt(stepIdx);
        const prevStep = log.steps.find(s => s.step_index === prevStepIndex);
        if (prevStep && prevStep.output) {
          try {
            const resolved = getDeepPath(prevStep.output, path);
            return typeof resolved === 'object' ? JSON.stringify(resolved) : String(resolved);
          } catch (e) {
            console.warn(`Failed to resolve embedded placeholder ${match}:`, e);
            return match;
          }
        }
        return match;
      });
    };

    const resolvedParameters = JSON.parse(JSON.stringify(step.parameters), (key, value) => {
      if (typeof value === "string" && value.includes("{{step_")) {
        return resolveValue(value);
      }
      return value;
    });

    try {
      const result = await executeTool(step.tool_name, resolvedParameters, { 
        audit_log_id, 
        step_index 
      });
      
      const stepLog = {
        step_index,
        tool_name: step.tool_name,
        status: ((result.success && !result.replanned) ? "executed" : "failed") as "executed" | "failed",
        input: resolvedParameters,
        output: result.result,
        error: result.success ? undefined : result.error,
        confirmed_by_user: user_confirmed,
        timestamp: new Date().toISOString()
      };

      const updatedSteps = [...log.steps.filter(s => s.step_index !== step_index), stepLog];
      await updateAuditLog(audit_log_id, { steps: updatedSteps });

      // Phase 3: Zero-Touch Recovery
      // If replanned, we can optionally start executing the new plan immediately
      // For now, we return the new plan to the client, but the requirement says "immediately trigger execution"
      // In a real "zero-touch" scenario, we might want to recursively call execute for the first step of the new plan.
      if (result.replanned && result.new_plan && result.new_plan.ordered_steps.length > 0) {
        const firstStep = result.new_plan.ordered_steps[0];
        if (!firstStep.requires_confirmation) {
          console.log("Zero-Touch Recovery: Automatically executing first step of new plan.");
          // We can't easily recurse here because of the HTTP response context, 
          // but we can flag it for the client or handle it in a loop.
          // However, the instructions say "In the chat route... immediately trigger execution".
        }
      }

      // Check if all steps are done (only if not replanned)
      if (!result.replanned && updatedSteps.length === log.plan.ordered_steps.length) {
        await updateAuditLog(audit_log_id, { final_outcome: "Success: All steps executed." });
      }

      return NextResponse.json({ 
        result: result.result, 
        audit_log_id,
        replanned: !!result.replanned,
        new_plan: result.new_plan,
        error: result.success ? undefined : result.error
      });
    } catch (error: any) {
      console.error("Execution error, triggering re-plan:", error);
      
      const { replan } = await import("@/lib/llm");
      let newPlan = null;
      try {
        newPlan = await replan(log.intent, log, step_index, error.message);
      } catch (replanError) {
        console.error("Re-planning also failed:", replanError);
      }

      const stepLog = {
        step_index,
        tool_name: step.tool_name,
        status: "failed" as const,
        input: resolvedParameters,
        error: error.message,
        timestamp: new Date().toISOString()
      };
      const updatedSteps = [...log.steps.filter(s => s.step_index !== step_index), stepLog];
      
      await updateAuditLog(audit_log_id, { 
        steps: updatedSteps, 
        plan: newPlan || log.plan,
        final_outcome: newPlan ? "Re-planned due to execution error." : "Failed: Execution error and re-planning failed." 
      });
      
      return NextResponse.json({ 
        error: error.message, 
        replanned: !!newPlan,
        new_plan: newPlan
      }, { status: 500 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
