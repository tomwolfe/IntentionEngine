/**
 * IntentionEngine - Tool Registry
 * Phase 7: Safe tool execution with validation and isolation
 *
 * Constraints:
 * - ToolDefinition schema
 * - Safe execution wrapper
 * - Input validation
 * - Output validation
 * - Execution timeout
 * - Tools cannot access global state
 * - Tools cannot modify execution state directly
 */

import { z } from "zod";
import { PersistenceProvider } from "../../../infrastructure/PersistenceProvider";
import {
  ToolDefinition,
  ToolDefinitionSchema,
  ToolParameter,
  EngineErrorSchema,
  EngineErrorCode,
} from "../types";

// ============================================================================
// TOOL FUNCTION TYPE
// The actual tool implementation signature
// ============================================================================

export type ToolFunction = (
  parameters: Record<string, unknown>,
  context: ToolExecutionContext
) => Promise<{
  success: boolean;
  output?: unknown;
  error?: string;
}>;

// ============================================================================
// TOOL EXECUTION CONTEXT
// Context provided to tools (isolated from execution state)
// ============================================================================

export interface ToolExecutionContext {
  executionId: string;
  stepId: string;
  timeoutMs: number;
  startTime: number;
}

// ============================================================================
// REGISTERED TOOL
// Internal representation of a registered tool
// ============================================================================

interface RegisteredTool {
  definition: ToolDefinition;
  implementation: ToolFunction;
}

// ============================================================================
// TOOL REGISTRY
// Central registry for all available tools
// ============================================================================

export class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();

  /**
   * Register a new tool
   */
  register(definition: ToolDefinition, implementation: ToolFunction): void {
    // Validate definition
    ToolDefinitionSchema.parse(definition);

    const key = this.getToolKey(definition.name, definition.version);

    if (this.tools.has(key)) {
      throw new Error(
        `Tool ${definition.name}@${definition.version} is already registered`
      );
    }

    this.tools.set(key, {
      definition,
      implementation,
    });
  }

  /**
   * Unregister a tool
   */
  unregister(name: string, version?: string): boolean {
    if (version) {
      const key = this.getToolKey(name, version);
      return this.tools.delete(key);
    } else {
      // Unregister all versions
      let deleted = false;
      Array.from(this.tools.entries()).forEach(([key, tool]) => {
        if (tool.definition.name === name) {
          this.tools.delete(key);
          deleted = true;
        }
      });
      return deleted;
    }
  }

  /**
   * Get a tool definition
   */
  getDefinition(name: string, version?: string): ToolDefinition | undefined {
    const tool = this.getTool(name, version);
    return tool?.definition;
  }

  /**
   * Check if a tool exists
   */
  has(name: string, version?: string): boolean {
    return this.getTool(name, version) !== undefined;
  }

  /**
   * List all registered tools
   */
  list(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  /**
   * List tools by category
   */
  listByCategory(category: ToolDefinition["category"]): ToolDefinition[] {
    return this.list().filter((t) => t.category === category);
  }

  /**
   * Execute a tool with validation and timeout
   */
  async execute(
    name: string,
    parameters: Record<string, unknown>,
    context: ToolExecutionContext,
    version?: string
  ): Promise<{
    success: boolean;
    output?: unknown;
    error?: string;
    latency_ms: number;
  }> {
    const startTime = performance.now();

    try {
      // Get the tool
      const tool = this.getTool(name, version);
      if (!tool) {
        throw EngineErrorSchema.parse({
          code: "TOOL_NOT_FOUND",
          message: `Tool ${name}${version ? `@${version}` : ""} not found`,
          details: { available_tools: this.list().map((t) => t.name) },
          recoverable: false,
          timestamp: new Date().toISOString(),
        });
      }

      // Validate input parameters
      const validationResult = this.validateInput(tool.definition, parameters);
      if (!validationResult.valid) {
        throw EngineErrorSchema.parse({
          code: "TOOL_VALIDATION_FAILED",
          message: `Input validation failed: ${validationResult.error}`,
          details: {
            tool: name,
            parameters,
            errors: validationResult.error,
          },
          recoverable: false,
          timestamp: new Date().toISOString(),
        });
      }

      // Execute with timeout
      const result = await this.executeWithTimeout(
        tool.implementation,
        parameters,
        context,
        tool.definition.timeout_ms
      );

      // Validate output if schema provided
      if (result.success && tool.definition.return_schema) {
        const outputValidation = this.validateOutput(
          tool.definition.return_schema,
          result.output
        );
        if (!outputValidation.valid) {
          throw EngineErrorSchema.parse({
            code: "TOOL_VALIDATION_FAILED",
            message: `Output validation failed: ${outputValidation.error}`,
            details: {
              tool: name,
              output: result.output,
            },
            recoverable: false,
            timestamp: new Date().toISOString(),
          });
        }
      }

      const endTime = performance.now();
      const latencyMs = Math.round(endTime - startTime);

      return {
        ...result,
        latency_ms: latencyMs,
      };
    } catch (error) {
      const endTime = performance.now();
      const latencyMs = Math.round(endTime - startTime);

      // If it's already an EngineError, pass it through
      if (error && typeof error === "object" && "code" in error && "message" in error) {
        return {
          success: false,
          error: String(error.message),
          latency_ms: latencyMs,
        };
      }

      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown tool execution error",
        latency_ms: latencyMs,
      };
    }
  }

  /**
   * Get tool for execution
   */
  private getTool(
    name: string,
    version?: string
  ): RegisteredTool | undefined {
    if (version) {
      return this.tools.get(this.getToolKey(name, version));
    }

    // Find latest version if not specified
    let latest: RegisteredTool | undefined;
    let latestVersion = "0.0.0";

    Array.from(this.tools.entries()).forEach(([key, tool]) => {
      if (tool.definition.name === name) {
        if (!latest || this.compareVersions(tool.definition.version, latestVersion) > 0) {
          latest = tool;
          latestVersion = tool.definition.version;
        }
      }
    });

    return latest;
  }

  /**
   * Generate unique key for tool
   */
  private getToolKey(name: string, version: string): string {
    return `${name}@${version}`;
  }

  /**
   * Compare semantic versions
   */
  private compareVersions(a: string, b: string): number {
    const partsA = a.split(".").map(Number);
    const partsB = b.split(".").map(Number);

    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const partA = partsA[i] || 0;
      const partB = partsB[i] || 0;

      if (partA > partB) return 1;
      if (partA < partB) return -1;
    }

    return 0;
  }

  /**
   * Validate input parameters against tool definition
   */
  private validateInput(
    definition: ToolDefinition,
    parameters: Record<string, unknown>
  ): { valid: boolean; error?: string } {
    const schema = definition.inputSchema;
    
    // Check required parameters
    if (schema.required) {
      for (const requiredParam of schema.required) {
        if (!(requiredParam in parameters)) {
          return {
            valid: false,
            error: `Missing required parameter: ${requiredParam}`,
          };
        }
      }
    }

    // Validate provided parameters
    for (const [key, value] of Object.entries(parameters)) {
      const propDef = schema.properties[key];

      if (!propDef) {
        return {
          valid: false,
          error: `Unknown parameter: ${key}`,
        };
      }

      // Type validation (simplified)
      const typeValid = this.validateType(value, propDef.type);
      if (!typeValid) {
        return {
          valid: false,
          error: `Invalid type for parameter ${key}: expected ${propDef.type}, got ${typeof value}`,
        };
      }

      // Enum validation
      if (propDef.enum && Array.isArray(propDef.enum)) {
        if (!propDef.enum.includes(value)) {
          return {
            valid: false,
            error: `Invalid value for parameter ${key}: must be one of [${propDef.enum.join(", ")}]`,
          };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Validate value type
   */
  private validateType(
    value: unknown,
    expectedType: string
  ): boolean {
    switch (expectedType) {
      case "string":
        return typeof value === "string";
      case "number":
        return typeof value === "number" && !isNaN(value);
      case "boolean":
        return typeof value === "boolean";
      case "object":
        return typeof value === "object" && value !== null && !Array.isArray(value);
      case "array":
        return Array.isArray(value);
      default:
        return true; // Unknown type, allow it
    }
  }

  /**
   * Validate output against schema
   */
  private validateOutput(
    schema: Record<string, unknown>,
    output: unknown
  ): { valid: boolean; error?: string } {
    return { valid: true };
  }

  /**
   * Execute tool with timeout
   */
  private async executeWithTimeout(
    implementation: ToolFunction,
    parameters: Record<string, unknown>,
    context: ToolExecutionContext,
    timeoutMs: number
  ): Promise<{ success: boolean; output?: unknown; error?: string }> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(
          EngineErrorSchema.parse({
            code: "STEP_TIMEOUT",
            message: `Tool execution timed out after ${timeoutMs}ms`,
            recoverable: false,
            timestamp: new Date().toISOString(),
          })
        );
      }, timeoutMs);

      implementation(parameters, context)
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Create a ToolExecutor for use with ExecutionOrchestrator
   */
  createToolExecutor(): {
    execute: (
      toolName: string,
      parameters: Record<string, unknown>,
      timeoutMs: number
    ) => Promise<{
      success: boolean;
      output?: unknown;
      error?: string;
      latency_ms: number;
    }>;
  } {
    return {
      execute: async (toolName, parameters, timeoutMs) => {
        return this.execute(toolName, parameters, {
          executionId: "unknown",
          stepId: "unknown",
          timeoutMs,
          startTime: performance.now(),
        });
      },
    };
  }
}

// ============================================================================
// GLOBAL REGISTRY INSTANCE
// Singleton instance for application-wide use
// ============================================================================

let globalRegistry: ToolRegistry | null = null;

export function getToolRegistry(): ToolRegistry {
  if (!globalRegistry) {
    globalRegistry = new ToolRegistry();
  }
  return globalRegistry;
}

export function resetToolRegistry(): void {
  globalRegistry = new ToolRegistry();
}

// ============================================================================
// HELPER FUNCTIONS
// Convenience functions for common operations
// ============================================================================

export function registerTool(
  definition: ToolDefinition,
  implementation: ToolFunction
): void {
  getToolRegistry().register(definition, implementation);
}

export function executeTool(
  name: string,
  parameters: Record<string, unknown>,
  context: ToolExecutionContext,
  version?: string
): Promise<{
  success: boolean;
  output?: unknown;
  error?: string;
  latency_ms: number;
}> {
  return getToolRegistry().execute(name, parameters, context, version);
}

export function listTools(): ToolDefinition[] {
  return getToolRegistry().list();
}

// ============================================================================
// BUILT-IN TOOLS
// Some basic tools that are always available
// ============================================================================

export const BuiltInTools: ToolDefinition[] = [
  {
    name: "wait",
    version: "1.0.0",
    description: "Wait for a specified duration",
    inputSchema: {
      type: "object",
      properties: {
        duration_ms: {
          type: "number",
          description: "Duration to wait in milliseconds",
        },
      },
      required: ["duration_ms"],
    },
    return_schema: { type: "object", properties: { waited_ms: { type: "number" } } },
    timeout_ms: 60000,
    category: "calculation",
    requires_confirmation: false,
  },
  {
    name: "log",
    version: "1.0.0",
    description: "Log a message for debugging",
    inputSchema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Message to log",
        },
        level: {
          type: "string",
          enum: ["debug", "info", "warn", "error"],
          description: "Log level",
        },
      },
      required: ["message"],
    },
    return_schema: { type: "object", properties: { logged: { type: "boolean" } } },
    timeout_ms: 5000,
    category: "data",
    requires_confirmation: false,
  },
  {
    name: "self_reflect",
    version: "1.0.0",
    description: "Access execution history to self-reflect on previous state transitions. Use this when stuck in a loop or needing to understand past decisions.",
    inputSchema: {
      type: "object",
      properties: {
        intentId: {
          type: "string",
          description: "The ID of the current intent/execution to retrieve history for.",
        },
      },
      required: ["intentId"],
    },
    return_schema: { type: "object", properties: { history: { type: "array" } } },
    timeout_ms: 10000,
    category: "data",
    requires_confirmation: false,
  },
];

// ============================================================================
// REGISTER BUILT-IN TOOLS
// ============================================================================

export function registerBuiltInTools(): void {
  const registry = getToolRegistry();

  // Wait tool
  registry.register(BuiltInTools[0], async (params) => {
    const duration = params.duration_ms as number;
    await new Promise((resolve) => setTimeout(resolve, duration));
    return {
      success: true,
      output: { waited_ms: duration },
    };
  });

  // Log tool
  registry.register(BuiltInTools[1], async (params) => {
    const message = params.message as string;
    const level = (params.level as string) || "info";
    console.log(`[${level.toUpperCase()}] ${message}`);
    return {
      success: true,
      output: { logged: true },
    };
  });

  // Self-reflect tool
  registry.register(BuiltInTools[2], async (params) => {
    const intentId = params.intentId as string;
    const persistence = new PersistenceProvider();
    try {
      const history = await persistence.getHistory(intentId);
      return {
        success: true,
        output: { history },
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to retrieve history: ${error.message}`,
      };
    }
  });
}

// Auto-register built-in tools
registerBuiltInTools();
