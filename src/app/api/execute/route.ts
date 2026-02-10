import { NextRequest, NextResponse } from "next/server";
import { getAuditLog, updateAuditLog } from "@/lib/audit";
import { executeTool } from "@/lib/tools";
import { withReliability } from "@/lib/reliability";
import { ExecuteRequestSchema } from "@/lib/validation-schemas";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  return withReliability(req, async () => {
    try {
      const rawBody = await req.json();
      const validatedBody = ExecuteRequestSchema.safeParse(rawBody);

      if (!validatedBody.success) {
        return NextResponse.json({ error: "Invalid request parameters", details: validatedBody.error.format() }, { status: 400 });
      }

      const { audit_log_id, step_index, user_confirmed, parameters: providedParams } = validatedBody.data;

      const log = await getAuditLog(audit_log_id);
      if (!log || !log.plan) {
        return NextResponse.json({ error: "Audit log or plan not found" }, { status: 404 });
      }

      const step = log.plan.ordered_steps[step_index];
      if (!step) {
        return NextResponse.json({ error: "Step not found" }, { status: 404 });
      }

      // Variable Injection: Resolve {{last_step_result.path}} placeholders
      const resolveVariables = (obj: any, lastResult: any): any => {
        if (typeof obj === 'string') {
          // If the entire string is a single placeholder, return the raw value (could be number, object, etc.)
          const fullMatch = obj.match(/^\{\{last_step_result\.(.*?)\}\}$/);
          if (fullMatch) {
            const path = fullMatch[1];
            const keys = path.split('.');
            let val = lastResult;
            for (const key of keys) {
              const match = key.match(/(.*)\[(\d+)\]/);
              if (match) {
                val = val?.[match[1]]?.[parseInt(match[2])];
              } else {
                val = val?.[key];
              }
            }
            return val !== undefined ? val : obj;
          }

          // Otherwise, do string interpolation
          return obj.replace(/\{\{last_step_result\.(.*?)\}\}/g, (_, path) => {
            const keys = path.split('.');
            let val = lastResult;
            for (const key of keys) {
              const match = key.match(/(.*)\[(\d+)\]/);
              if (match) {
                val = val?.[match[1]]?.[parseInt(match[2])];
              } else {
                val = val?.[key];
              }
            }
            return val !== undefined ? val : `{{last_step_result.${path}}}`;
          });
        }
        if (Array.isArray(obj)) {
          return obj.map(item => resolveVariables(item, lastResult));
        }
        if (typeof obj === 'object' && obj !== null) {
          const newObj: any = {};
          for (const key in obj) {
            newObj[key] = resolveVariables(obj[key], lastResult);
          }
          return newObj;
        }
        return obj;
      };

      let resolvedParameters = step.parameters;
      if (step_index > 0) {
        const lastStepLog = log.steps.find(s => s.step_index === step_index - 1);
        if (lastStepLog && lastStepLog.status === "executed") {
          resolvedParameters = resolveVariables(step.parameters, lastStepLog.output);
        }
      }

      // Merge provided parameters with resolved parameters
      const parameters = providedParams ? { ...resolvedParameters, ...providedParams } : resolvedParameters;

      // Check if already executed
      const existingStepLog = log.steps.find(s => s.step_index === step_index);
      if (existingStepLog && existingStepLog.status === "executed") {
        return NextResponse.json({ error: "Step already executed" }, { status: 400 });
      }

      // Step Validation Guard: Ensure sequential execution
      if (step_index !== log.steps.length) {
        return NextResponse.json({ 
          error: `Invalid step index ${step_index}. Expected ${log.steps.length}.`,
          current_step: log.steps.length 
        }, { status: 400 });
      }

      if (step.requires_confirmation && !user_confirmed) {
        return NextResponse.json({ error: "User confirmation required for this step" }, { status: 403 });
      }

      try {
        const result = await executeTool(step.tool_name, parameters);
        
        const stepLog = {
          step_index,
          tool_name: step.tool_name,
          status: "executed" as const,
          input: parameters,
          output: result,
          confirmed_by_user: user_confirmed,
        };

        const updatedSteps = [...log.steps.filter(s => s.step_index !== step_index), stepLog];
        
        try {
          await updateAuditLog(audit_log_id, { steps: updatedSteps });

          // Check if all steps are done
          if (updatedSteps.length === log.plan.ordered_steps.length) {
            await updateAuditLog(audit_log_id, { 
              final_outcome: { 
                status: "SUCCESS", 
                message: "All steps executed successfully." 
              } 
            });
          }
        } catch (auditError: any) {
          console.error(`CRITICAL: Tool ${step.tool_name} succeeded but updateAuditLog failed for log ${audit_log_id}.`, {
            audit_log_id,
            step_index,
            tool_result: result,
            error: auditError.message
          });
        }

        return NextResponse.json({ result, audit_log_id });
      } catch (error: any) {
        const stepLog = {
          step_index,
          tool_name: step.tool_name,
          status: "failed" as const,
          input: step.parameters,
          error: error.message,
        };
        const updatedSteps = [...log.steps.filter(s => s.step_index !== step_index), stepLog];
        
        try {
          await updateAuditLog(audit_log_id, { 
            steps: updatedSteps, 
            final_outcome: { 
              status: "FAILURE", 
              message: `Execution failed at step ${step_index}: ${error.message}` 
            } 
          });
        } catch (auditError: any) {
          console.error(`CRITICAL: Tool ${step.tool_name} failed AND updateAuditLog failed for log ${audit_log_id}.`, {
            audit_log_id,
            step_index,
            tool_error: error.message,
            audit_error: auditError.message
          });
        }
        
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } catch (error: any) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
  });
}