import { z } from "zod";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodObject<any>;
  responseSchema?: z.ZodType<any>;
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
