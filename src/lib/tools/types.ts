import { z } from "zod";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodObject<any>;
  requires_confirmation: boolean;
}

export interface ToolResult<T = any> {
  success: boolean;
  result?: T;
  error?: string;
}

export interface Tool<TParams = any, TResult = any> {
  definition: ToolDefinition;
  execute: (params: TParams) => Promise<ToolResult<TResult>>;
}

export type ToolRegistry = Record<string, Tool>;
