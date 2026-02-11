import { z } from "zod";
import { ToolDefinition as EngineToolDefinition, ToolParameter } from "../engine/types";

/**
 * Tool definition metadata without execute function.
 * Used for exporting tool definitions before registration.
 */
export interface ToolDefinitionMetadata extends EngineToolDefinition {
  /** Optional Zod schema for response validation */
  responseSchema?: z.ZodType<any>;
}

/**
 * Extended ToolDefinition that includes the execute function
 * and optional Zod responseSchema for runtime validation.
 */
export interface ToolDefinition extends ToolDefinitionMetadata {
  /** Execution function for the tool */
  execute: (params: any) => Promise<{ success: boolean; result?: any; error?: string }>;
}

export type ExecuteToolResult = {
  success: boolean;
  result?: any;
  error?: string;
  replanned?: boolean;
  new_plan?: any;
  error_explanation?: string;
};

export type { ToolParameter };
