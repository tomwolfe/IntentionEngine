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
    const resolvedParameters = JSON.parse(JSON.stringify(step.parameters), (key, value) => {
      if (typeof value === "string" && value.includes("{{step_")) {
        const match = value.match(/{{step_(\d+)\.(.+?)}}/);
        if (match) {
          const prevStepIndex = parseInt(match[1]);
          const path = match[2];
          const prevStep = log.steps.find(s => s.step_index === prevStepIndex);
          if (prevStep && prevStep.output) {
            // Simple path resolution (e.g., "result.lat" or "result[0].name")
            try {
              const parts = path.split(".");
              let current = prevStep.output;
              for (const part of parts) {
                if (part.includes("[") && part.includes("]")) {
                  const arrayName = part.split("[")[0];
                  const index = parseInt(part.split("[")[1].split("]")[0]);
                  current = arrayName ? current[arrayName][index] : current[index];
                } else {
                  current = current[part];
                }
              }
              return current;
            } catch (e) {
              console.warn(`Failed to resolve placeholder ${value}:`, e);
              return value;
            }
          }
        }
      }
      return value;
    });

    try {
      const result = await executeTool(step.tool_name, resolvedParameters);
      
      // Check for "no results" scenario specifically for search_restaurant
      if (step.tool_name === "search_restaurant" && result.success && (!result.result || result.result.length === 0)) {
        console.log("No restaurants found, triggering re-plan...");
        const newPlan = await replan(log.intent, log, step_index, "No restaurants found for the given criteria.");
        
        const stepLog = {
          step_index,
          tool_name: step.tool_name,
          status: "failed" as const,
          input: resolvedParameters,
          output: result,
          error: "No results found. Re-planning...",
        };

        const updatedSteps = [...log.steps.filter(s => s.step_index !== step_index), stepLog];
        await updateAuditLog(audit_log_id, { 
          steps: updatedSteps, 
          plan: newPlan,
          final_outcome: "Re-planned due to no results." 
        });

        return NextResponse.json({ 
          result, 
          audit_log_id, 
          replanned: true, 
          new_plan: newPlan 
        });
      }

      const stepLog = {
        step_index,
        tool_name: step.tool_name,
        status: "executed" as const,
        input: resolvedParameters,
        output: result,
        confirmed_by_user: user_confirmed,
      };

      const updatedSteps = [...log.steps.filter(s => s.step_index !== step_index), stepLog];
      await updateAuditLog(audit_log_id, { steps: updatedSteps });

      // Check if all steps are done
      if (updatedSteps.length === log.plan.ordered_steps.length) {
        await updateAuditLog(audit_log_id, { final_outcome: "Success: All steps executed." });
      }

      return NextResponse.json({ result, audit_log_id });
    } catch (error: any) {
      console.error("Execution error, triggering re-plan:", error);
      
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
